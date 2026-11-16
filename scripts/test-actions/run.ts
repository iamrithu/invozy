// Runs the real server actions against a throwaway local Postgres: stock,
// returns, purchases and attachments as one company, then a second company
// trying to read and change the first one's data (tenancy).
//
//   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/invozy_test npm run test:actions
//
// The database is wiped first (prisma migrate reset), so only a localhost
// URL is accepted — never point this at the real database. Uploads go to a
// temporary folder, never to Blob storage. Sign-in, the company lookup,
// cache revalidation and PDF prebuilds are stubbed (see tsconfig.json).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function refuse(message: string): never {
  console.error(message);
  process.exit(2);
}

const url = process.env.TEST_DATABASE_URL;
if (!url) refuse('Set TEST_DATABASE_URL to a local, throwaway Postgres database (it gets wiped).');
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname)) refuse(`TEST_DATABASE_URL must be on localhost — refusing to wipe ${new URL(url).hostname}.`);
// Set before anything loads .env, which never overrides a variable that's
// already there: the actions see the test database and no Blob token.
process.env.DATABASE_URL = url;
process.env.BLOB_READ_WRITE_TOKEN = '';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ''}`);
  if (!cond) failures++;
}

async function main() {
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', { stdio: 'inherit', env: process.env });
  // src/lib/uploads.ts stores local uploads under <cwd>/public/uploads.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'invozy-test-actions-'));
  process.chdir(work);

  const { prisma, rootPrisma } = await import('@/lib/prisma');
  const invoices = await import('@/actions/invoices');
  const purchases = await import('@/actions/purchases');
  const inventory = await import('@/actions/inventory');
  const creditNotes = await import('@/actions/credit-notes');
  const statements = await import('@/actions/statements');
  const g = globalThis as { __TEST_USER?: { id: string; role: 'OWNER' | 'STAFF'; companyId: string } };

  const stock = async (id = 'p1') => Number((await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty);

  // ---- fixtures: company A (companies and logins are platform-level → rootPrisma)
  const coA = await rootPrisma.company.create({ data: { name: 'Test Co', state: 'Tamil Nadu', invoiceFY: '26-27' } });
  const owner = await rootPrisma.user.create({ data: { companyId: coA.id, email: 'owner@test', passwordHash: 'x', role: 'OWNER' } });
  const staff = await rootPrisma.user.create({ data: { companyId: coA.id, email: 'staff@test', passwordHash: 'x', role: 'STAFF' } });
  const asOwner = () => (g.__TEST_USER = { id: owner.id, role: 'OWNER', companyId: coA.id });
  const asStaff = () => (g.__TEST_USER = { id: staff.id, role: 'STAFF', companyId: coA.id });
  asOwner();
  await prisma.customer.create({ data: { id: 'c1', name: 'Shop', state: 'Tamil Nadu' } });
  await prisma.product.create({ data: { id: 'p1', name: 'Cassata', category: 'Ice', unit: 'Box', price: 100, trackStock: true, stockQty: 100 } });
  await prisma.product.create({ data: { id: 'p2', name: 'Kulfi', category: 'Ice', unit: 'Box', price: 50, trackStock: true, stockQty: 50 } });
  await prisma.product.create({ data: { id: 'p3', name: 'Cone', category: 'Ice', unit: 'Box', price: 80, trackStock: true, stockQty: 20 } });
  await prisma.product.create({ data: { id: 'p4', name: 'Cassata', category: 'Ice', unit: 'Box', price: 500, trackStock: true, stockQty: 20 } });
  await prisma.supplier.create({ data: { id: 's1', name: 'Supplier', state: 'Tamil Nadu' } });

  const bill = (qty: number, extra: Record<string, unknown> = {}, productId = 'p1') => ({
    customerId: 'c1',
    date: '2026-11-01',
    due: '2026-11-01',
    items: [{ productId, name: productId, unit: 'Box', qty, rate: 100, discount: 0 }],
    ...extra,
  });
  const legacyDraft = (num: string, qty: number) =>
    prisma.invoice.create({
      data: {
        number: num, date: new Date('2026-10-30'), due: new Date('2026-10-30'), customerId: 'c1', status: 'DRAFT', stockTaken: false, total: qty * 100,
        items: { create: [{ productId: 'p1', name: 'Cassata', unit: 'Box', qty, rate: 100, stockQty: qty }] },
      },
    });

  // ---- every save takes stock; only a draft's delete gives it back
  const a = await invoices.createInvoice(bill(10));
  check('draft saved', !a.error && a.status === 'DRAFT', a);
  check('draft took stock: 100 → 90', (await stock()) === 90, await stock());
  const b = await invoices.createInvoice(bill(5, { markPaid: true, paymentMode: 'Cash' }));
  check('paid invoice took stock: 90 → 85', !b.error && (await stock()) === 85, b);
  const c = await invoices.updateInvoice(a.invoiceId!, bill(12));
  check('editing a draft moved only the difference: 85 → 83', !c.error && (await stock()) === 83, c);
  const d = await invoices.updateInvoice(a.invoiceId!, bill(12, { markSent: true }));
  check('sending a draft moved nothing: 83', d.status === 'SENT' && (await stock()) === 83, d);
  const e = await invoices.deleteInvoice(b.invoiceId!);
  check('deleting a paid invoice did not restock: 83', !e.error && (await stock()) === 83, e);
  const f = await invoices.createInvoice(bill(3));
  await invoices.deleteInvoice(f.invoiceId!);
  check('deleting a draft restocked: 83', (await stock()) === 83, await stock());

  // ---- drafts saved before drafts took stock
  const g1 = await legacyDraft('OLD-1', 7);
  await invoices.deleteInvoice(g1.id);
  check('old draft deleted without restocking: 83', (await stock()) === 83, await stock());
  const h = await legacyDraft('OLD-2', 4);
  await invoices.updateInvoice(h.id, bill(4));
  check('old draft took its stock when saved: 83 → 79', (await stock()) === 79, await stock());
  await invoices.deleteInvoice(h.id);
  check('…and gave it back when deleted: 83', (await stock()) === 83, await stock());
  const i = await legacyDraft('OLD-3', 2);
  await invoices.recordPayment(i.id, { amount: 200, date: '2026-11-01', mode: 'Cash' });
  check('old draft took its stock when paid: 83 → 81', (await stock()) === 81, await stock());

  // ---- short stock: refused, unless the owner saves anyway
  const j = await invoices.createInvoice(bill(1000));
  check('draft over stock refused', !!j.error && /Not enough stock/.test(j.error), j);
  asStaff();
  const jStaff = await invoices.createInvoice(bill(100, { allowNegativeStock: true }));
  check('staff cannot save below zero', !!jStaff.error && /Only the owner/.test(jStaff.error), jStaff);
  asOwner();
  const jOwner = await invoices.createInvoice(bill(100, { allowNegativeStock: true }));
  check('owner can save below zero: 81 → -19', !jOwner.error && (await stock()) === -19, { jOwner, s: await stock() });
  await invoices.deleteInvoice(jOwner.invoiceId!);
  check('…and deleting that draft restores it: 81', (await stock()) === 81, await stock());

  // ---- duplicate, and sent → draft → delete
  const k = await invoices.duplicateInvoice(a.invoiceId!);
  check('duplicate took stock: 81 → 69', !k.error && (await stock()) === 69, k);
  await invoices.updateInvoice(k.invoiceId!, bill(12, { markSent: true }));
  const l = await invoices.updateInvoice(k.invoiceId!, bill(12));
  check('moving a sent invoice back to draft moved nothing: 69', l.status === 'DRAFT' && (await stock()) === 69, l);
  await invoices.deleteInvoice(k.invoiceId!);
  check('…and deleting it as a draft restocked: 81', (await stock()) === 81, await stock());

  // ---- deleting a draft: the owner picks restock or not
  const keepGone = await invoices.createInvoice(bill(4, {}, 'p3'));
  const heldNow = await invoices.getHeldStock(keepGone.invoiceId!);
  check('held stock lists what the draft holds', heldNow.lines?.length === 1 && heldNow.lines[0].name === 'Cone' && /^4\b/.test(heldNow.lines[0].qty), heldNow);
  await invoices.deleteInvoice(keepGone.invoiceId!, { restock: false });
  check('delete without restock leaves stock out: 20 → 16', (await stock('p3')) === 16, await stock('p3'));
  const putBack = await invoices.createInvoice(bill(2, {}, 'p3'));
  await invoices.deleteInvoice(putBack.invoiceId!, { restock: true });
  check('restock & delete puts it back: 16', (await stock('p3')) === 16, await stock('p3'));
  const paidHeld = await invoices.createInvoice(bill(1, { markPaid: true, paymentMode: 'Cash' }, 'p3'));
  const paidLines = (await invoices.getHeldStock(paidHeld.invoiceId!)).lines ?? [];
  check('a paid invoice lists what a credit note could return', paidLines.length === 1 && /^1\b/.test(paidLines[0].qty), paidLines);
  check('an old draft holding nothing lists nothing', ((await invoices.getHeldStock((await legacyDraft('OLD-9', 1)).id)).lines ?? []).length === 0);

  // ---- drafts holding stock
  const held = await invoices.createInvoice(bill(1));
  const drafts = await inventory.getDraftsHoldingStock();
  check('drafts holding stock are listed', drafts.count === 1 && drafts.numbers.length === 1, drafts);
  await invoices.deleteInvoice(held.invoiceId!);

  // ---- ledger: invoice reversals count as sales reduced, not returns
  const r = await invoices.createInvoice(bill(5, {}, 'p2'));
  await invoices.updateInvoice(r.invoiceId!, bill(3, {}, 'p2'));
  await invoices.deleteInvoice(r.invoiceId!);
  await inventory.addStockMovement('p2', { type: 'SALE_RETURN', qty: 1, unit: 'Box', date: '2026-11-01' });
  const ledger = await inventory.getStockLedger('p2');
  check('ledger: reversed draft nets to 0 sold', ledger?.summary.sold === 0, ledger?.summary);
  check('ledger: only the real return counts as a return', ledger?.summary.returns === 1, ledger?.summary);
  check('ledger: closing stock unchanged by the reclassifying', ledger?.summary.closing === 51 && (await stock('p2')) === 51, ledger?.summary);
  check('ledger: Sales filter count includes reversals', ledger?.groupCounts.sale === 3 && ledger?.groupCounts.return === 1, ledger?.groupCounts);
  const returnsOnly = await inventory.getStockLedger('p2', { type: 'return' });
  check('ledger: Returns filter lists only the real return', returnsOnly?.movements.length === 1 && !returnsOnly.movements[0].invoiceNumber, returnsOnly?.movements);

  // ---- one-tap send, last order, reminders
  const oldDraft = await legacyDraft('OLD-10', 2);
  const sentOld = await invoices.sendDraft(oldDraft.id);
  check('sending an old draft takes its stock: 81 → 79', !sentOld.error && (await stock()) === 79, { sentOld, s: await stock() });
  check('…and it is now sent', (await prisma.invoice.findUniqueOrThrow({ where: { id: oldDraft.id } })).status === 'SENT');
  const newDraft = await invoices.createInvoice(bill(1));
  const sentNew = await invoices.sendDraft(newDraft.invoiceId!);
  check('sending a normal draft moves nothing more: 78', !sentNew.error && (await stock()) === 78, { sentNew, s: await stock() });
  check('a sent invoice can’t be sent again', !!(await invoices.sendDraft(newDraft.invoiceId!)).error);
  const last = await invoices.getLastOrder('c1');
  check('last order is the newest invoice with catalog lines', !!last && last.items.length === 1 && last.items[0].productId === 'p1', last);
  check('last order skips the invoice being edited', (await invoices.getLastOrder('c1', newDraft.invoiceId!))?.number !== last?.number);
  await prisma.invoice.update({ where: { id: newDraft.invoiceId! }, data: { due: new Date('2026-01-01') } });
  const overdue = await invoices.listOverdueForReminders();
  check('overdue unpaid invoices are listed for reminders', overdue.some((r) => r.id === newDraft.invoiceId && r.balance > 0), overdue);
  check('reorder suggestions load', Array.isArray((await inventory.getReorderSuggestions()).items));

  // ---- stock in any unit: Box of 25, Bag of 40, loose pieces
  await prisma.product.create({
    data: {
      id: 'p5', name: 'Kulfi Bag', category: 'Ice', unit: 'Box', price: 200, packQty: 25, trackStock: true, stockQty: 0,
      priceTiers: { create: [{ unit: 'Box', price: 200, approxQty: 25, sortOrder: 0 }, { unit: 'Bag', price: 400, approxQty: 40, sortOrder: 1 }] },
    },
  });
  const units = await import('@/lib/stock-units');
  const p5 = await prisma.product.findUniqueOrThrow({ where: { id: 'p5' }, include: { priceTiers: true } });
  check('loose pieces are offered as a stock unit', units.stockUnits(p5).join(',') === 'Box,Bag,Piece', units.stockUnits(p5));
  const inBag = await inventory.addStockMovement('p5', { type: 'PURCHASE', qty: 1, unit: 'Bag', date: '2026-11-01' });
  const inPcs = await inventory.addStockMovement('p5', { type: 'PURCHASE', qty: 10, unit: 'Piece', date: '2026-11-01' });
  check('1 Bag (40 pcs) + 10 pieces = 2 Box (50 pcs)', !inBag.error && !inPcs.error && (await stock('p5')) === 2, { inBag, inPcs, s: await stock('p5') });
  check('shown as 2 Box · 50 pcs', units.formatStock(2, p5) === '2 Box' && units.piecesText(2, p5) === '50 pcs', [units.formatStock(2, p5), units.piecesText(2, p5)]);
  check('an unknown unit is still refused', !!(await inventory.addStockMovement('p5', { type: 'PURCHASE', qty: 1, unit: 'Crate', date: '2026-11-01' })).error);

  // ---- returns: good and damaged parts, part credit, deduction, refund / adjust
  const p4 = () => stock('p4');
  const sale = await invoices.createInvoice({
    customerId: 'c1', date: '2026-11-01', due: '2026-11-01', markPaid: true, paymentMode: 'Cash',
    items: [{ productId: 'p4', name: 'Cassata', unit: 'Box', qty: 4, rate: 500, discount: 20 }],
  });
  check('paid sale of 4 Box: 20 → 16', !sale.error && (await p4()) === 16, sale);
  const src = (await creditNotes.getCreditNoteSource(sale.invoiceId!)).source!;
  const lineId = src.lines[0].lineId;
  const cn1 = await creditNotes.createCreditNote({
    invoiceId: sale.invoiceId!, date: '2026-11-01', reason: 'RETURN', note: '1 melted',
    lines: [
      { lineId, qty: 1, rate: 500, discount: 20, creditPct: 100, restock: true },
      { lineId, qty: 1, rate: 500, discount: 20, creditPct: 50, restock: false },
    ],
    deduction: 50, deductionReason: 'Handling',
  });
  // 400 + 200 = 600 credited, − 50 handling = 550 taxable, + 18% = 649.
  check('credit note: part credit and deduction before GST = ₹649', !cn1.error && cn1.total === 649, cn1);
  check('only the good part went back to stock: 16 → 17', (await p4()) === 17, await p4());
  check('paid invoice: all ₹649 is the customer’s credit', cn1.refundDue === 649 && cn1.applied === 0, cn1);
  const tooMany = await creditNotes.createCreditNote({ invoiceId: sale.invoiceId!, date: '2026-11-01', reason: 'RETURN', lines: [{ lineId, qty: 3, rate: 500, discount: 20, restock: true }] });
  check('can’t return more than is still open on the line', !!tooMany.error && /only 2/i.test(tooMany.error), tooMany);
  const bigDeduction = await creditNotes.createCreditNote({ invoiceId: sale.invoiceId!, date: '2026-11-01', reason: 'RETURN', lines: [{ lineId, qty: 1, rate: 500, discount: 20, restock: true }], deduction: 1000 });
  check('a deduction bigger than the credit is refused', !!bigDeduction.error && /deduction/i.test(bigDeduction.error), bigDeduction);

  const unpaid = await invoices.createInvoice({
    customerId: 'c1', date: '2026-11-01', due: '2026-11-30', markSent: true,
    items: [{ productId: 'p4', name: 'Cassata', unit: 'Box', qty: 2, rate: 500, discount: 0 }],
  });
  const targets = await creditNotes.listInvoicesForCredit(cn1.creditNoteId!);
  check('unpaid invoices are offered for adjusting', targets.some((t) => t.id === unpaid.invoiceId), targets);
  const adj = await creditNotes.applyCreditToInvoice(cn1.creditNoteId!, unpaid.invoiceId!, 300);
  const unpaidRow = await prisma.invoice.findUniqueOrThrow({ where: { id: unpaid.invoiceId! } });
  check('adjusting ₹300 part-pays the other invoice', !adj.error && Number(unpaidRow.amountPaid) === 300 && unpaidRow.status === 'PARTIALLY_PAID', { adj, paid: unpaidRow.amountPaid, status: unpaidRow.status });
  check('can’t adjust more than is open', !!(await creditNotes.applyCreditToInvoice(cn1.creditNoteId!, unpaid.invoiceId!, 1000)).error);
  const refund = await creditNotes.recordRefund(cn1.creditNoteId!, { amount: 349, date: '2026-11-02', mode: 'Cash' });
  check('refunding the remaining ₹349 works', !refund.error, refund);
  check('can’t refund past what’s open', !!(await creditNotes.recordRefund(cn1.creditNoteId!, { amount: 1, date: '2026-11-02', mode: 'Cash' })).error);

  // The statement's closing balance = what the invoices still owe − credit still held.
  const st = (await statements.getCustomerStatement('c1')).statement!;
  const owed = (await prisma.invoice.findMany({ where: { customerId: 'c1', status: { not: 'DRAFT' } } })).reduce((sum, i) => sum + Number(i.total) - Number(i.amountPaid), 0);
  const notes = await prisma.creditNote.findMany({ where: { customerId: 'c1' }, include: { payments: true, refunds: true } });
  const creditHeld = notes.reduce((sum, n) => sum + Number(n.total) - n.payments.reduce((a, x) => a + Number(x.amount), 0) - n.refunds.reduce((a, x) => a + Number(x.amount), 0), 0);
  check('statement closing = invoices owed − credit held', Math.abs(st.closing - (owed - creditHeld)) < 0.01, { closing: st.closing, owed, creditHeld });
  check('statement shows the credit note and the refund', st.rows.some((r) => r.kind === 'credit-note' && r.credit === 649) && st.rows.some((r) => r.kind === 'refund' && r.debit === 349), st.rows.map((r) => r.kind));

  const blocked = await creditNotes.deleteCreditNote(cn1.creditNoteId!);
  check('a credit note with refunds paid can’t be deleted', !!blocked.error && /refund/i.test(blocked.error), blocked);
  const refundRow = await prisma.refund.findFirstOrThrow({ where: { creditNoteId: cn1.creditNoteId! } });
  asStaff();
  check('staff can’t remove a refund', !!(await creditNotes.deleteRefund(refundRow.id)).error);
  asOwner();
  check('owner removes the refund', !(await creditNotes.deleteRefund(refundRow.id)).error);
  const adjPayment = await prisma.payment.findFirstOrThrow({ where: { creditNoteId: cn1.creditNoteId!, invoiceId: unpaid.invoiceId! } });
  check('owner removes the adjustment', !(await creditNotes.removeCreditAdjustment(adjPayment.id)).error);
  const unpaidAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: unpaid.invoiceId! } });
  check('…and the other invoice is unpaid again', Number(unpaidAfter.amountPaid) === 0 && unpaidAfter.status === 'SENT', unpaidAfter.status);

  const cn2 = await creditNotes.createCreditNote({
    invoiceId: sale.invoiceId!, date: '2026-11-02', reason: 'RETURN',
    lines: [{ lineId, qty: 1, rate: 500, discount: 20, creditPct: 100, restock: true }],
    refundNow: { mode: 'UPI', reference: 'UTR123' },
  });
  check('refund now pays the whole credit back at once', !cn2.error && cn2.refunded === cn2.total && cn2.total === 472, cn2);
  const stockBeforeDelete = await p4();
  const del1 = await creditNotes.deleteCreditNote(cn1.creditNoteId!);
  check('deleting the credit note takes its restocked part back out', !del1.error && (await p4()) === stockBeforeDelete - 1, { del1, before: stockBeforeDelete, now: await p4() });

  // ---- purchases with attachments
  const file = (name: string, type: string, body = 'x') => {
    const fd = new FormData();
    fd.append('file', new File([body], name, { type }));
    return fd;
  };
  const onDisk = (u: string) => fs.existsSync(path.join(work, 'public', u));
  const u1 = await purchases.uploadPurchaseAttachment(file('bill.pdf', 'application/pdf', '%PDF-1.4'));
  const u2 = await purchases.uploadPurchaseAttachment(file('photo.jpg', 'image/jpeg'));
  const u3 = await purchases.uploadPurchaseAttachment(file('notes.txt', 'text/plain'));
  check('PDF and photo upload', !!u1.attachment && !!u2.attachment && onDisk(u1.attachment.url) && onDisk(u2.attachment.url), { u1, u2 });
  check('other file types refused', !!u3.error, u3);

  const line = { productId: 'p1', name: 'Cassata', unit: 'Box', qty: 10, rate: 50, gstRate: 18 };
  const foreign = await purchases.savePurchase(null, { supplierId: 's1', date: '2026-11-01', items: [line], attachments: [{ url: 'https://example.com/x.pdf', name: 'x.pdf', contentType: 'application/pdf', size: 1 }] });
  check('attachment URL from elsewhere refused', !!foreign.error, foreign);
  const sneaky = await purchases.savePurchase(null, { supplierId: 's1', date: '2026-11-01', items: [line], attachments: [{ url: '/uploads/purchases/../products/a.png', name: 'a', contentType: 'image/png', size: 1 }] });
  check('path-traversal attachment URL refused', !!sneaky.error, sneaky);

  const p1 = await purchases.savePurchase(null, { supplierId: 's1', billNo: 'B-1', date: '2026-11-01', items: [line], attachments: [u1.attachment!, u2.attachment!] });
  check('bill saved with 2 files, stock added: 78 → 88', !p1.error && (await stock()) === 88, p1);
  check('owner sees the cost price', (await inventory.getCostsForBilling(['p1'])).p1 === 50);
  asStaff();
  check('staff don’t see cost prices', Object.keys(await inventory.getCostsForBilling(['p1'])).length === 0);
  asOwner();
  const detail = await purchases.getPurchase(p1.purchaseId!);
  check('files come back in order', detail?.attachments.map((x) => x.name).join(',') === 'bill.pdf,photo.jpg', detail?.attachments);
  check('list shows the file count', (await purchases.listPurchasesPage()).items[0]?.attachmentCount === 2);
  const reuse = await purchases.savePurchase(null, { supplierId: 's1', billNo: 'B-2', date: '2026-11-01', items: [line], attachments: [u1.attachment!] });
  check('another bill’s file refused', !!reuse.error, reuse);

  const orphan = await purchases.uploadPurchaseAttachment(file('orphan.png', 'image/png'));
  await purchases.discardPurchaseUploads([orphan.attachment!.url, u1.attachment!.url]);
  check('discard deletes an unsaved upload, keeps a saved one', !onDisk(orphan.attachment!.url) && onDisk(u1.attachment!.url));

  asStaff();
  const staffRemove = await purchases.savePurchase(p1.purchaseId!, { supplierId: 's1', billNo: 'B-1', date: '2026-11-01', items: [line], attachments: [u1.attachment!] });
  check('staff cannot remove a saved file', !!staffRemove.error && onDisk(u2.attachment!.url), staffRemove);
  asOwner();
  const ownerRemove = await purchases.savePurchase(p1.purchaseId!, { supplierId: 's1', billNo: 'B-1', date: '2026-11-01', items: [line], attachments: [u1.attachment!] });
  check('owner removes a file: deleted from storage', !ownerRemove.error && !onDisk(u2.attachment!.url) && onDisk(u1.attachment!.url), ownerRemove);
  const del = await purchases.deletePurchase(p1.purchaseId!);
  check('deleting the bill deletes its files and takes the stock back: 78', !del.error && !onDisk(u1.attachment!.url) && (await stock()) === 78, del);

  // ---- company page: each section saves only its own fields
  const companyActions = await import('@/actions/company');
  const coRow = () => prisma.company.findUniqueOrThrow({ where: { id: coA.id } });
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  await prisma.company.update({ where: { id: coA.id }, data: { nextInvoiceNo: 42, showUpiQr: true, cgstEnabled: true, pdfShowHsnSummary: true } });
  const coBefore = await coRow();
  const bankSave = await companyActions.updateCompany(
    {},
    form({ _fields: 'bankName,bankAcc,ifsc,branch,upi,showUpiQr,showGpayNumber,pdfShowBankDetails', bankName: 'Test Co', bankAcc: '1234567890', ifsc: 'SBIN0000001', branch: '', upi: 'test@upi', pdfShowBankDetails: 'on' })
  );
  const coAfter = await coRow();
  check('bank section saves its fields; a switch left off there turns off', !bankSave.error && coAfter.bankAcc === '1234567890' && coAfter.upi === 'test@upi' && coAfter.pdfShowBankDetails && !coAfter.showUpiQr, { bankSave, coAfter });
  check(
    '…and leaves other sections alone (invoice counter, GST switches, HSN summary, name)',
    coAfter.nextInvoiceNo === 42 && coAfter.cgstEnabled && coAfter.pdfShowHsnSummary && coAfter.name === coBefore.name && coAfter.state === coBefore.state,
    coAfter
  );
  const blankName = await companyActions.updateCompany({}, form({ _fields: 'name,domain,phone,altPhone', name: '', phone: '99' }));
  check('a blank business name is refused, field flagged', !!blankName.fieldErrors?.name && (await coRow()).name === coBefore.name, blankName);
  const logoOnly = await companyActions.updateCompany({}, form({ _fields: '' }));
  check('a logo-only save with nothing picked changes nothing', !logoOnly.error && (await coRow()).updatedAt.getTime() >= coAfter.updatedAt.getTime() && (await coRow()).bankAcc === '1234567890', logoOnly);
  const legacy = await companyActions.updateCompany({}, form({ name: 'Only name' }));
  check('a save without a section list still needs every required field', !!legacy.error && (await coRow()).name === coBefore.name, legacy);

  // ---- discounts: product default, and hiding them on the PDF
  const productActions = await import('@/actions/products');
  const { printedLines } = await import('@/components/invoices/invoice-sheet');
  const { computeTotals } = await import('@/lib/gst');
  const productForm = (discount: string) =>
    form({ name: `Disc ${discount}`, category: 'Ice', unit: 'Box', price: '100', discount, tiers: JSON.stringify([{ unit: 'Box', price: 100 }]) });
  const withDiscount = await productActions.createProduct({}, productForm('12.5'));
  check('a product saves its default discount %', !withDiscount.error && Number((await prisma.product.findUniqueOrThrow({ where: { id: withDiscount.id! } })).discount) === 12.5, withDiscount);
  const blankDiscount = await productActions.createProduct({}, productForm(''));
  check('a blank discount saves as none', !blankDiscount.error && Number((await prisma.product.findUniqueOrThrow({ where: { id: blankDiscount.id! } })).discount) === 0, blankDiscount);
  check('a discount over 100% is refused', !!(await productActions.createProduct({}, productForm('120'))).fieldErrors?.discount);

  const dLines = [
    { qty: 2, rate: 320, discount: 20 },
    { qty: 1, rate: 180, discount: 0 },
  ];
  const rates = { cgstRate: 2.5, sgstRate: 2.5, igstRate: 5, cgstEnabled: true, sgstEnabled: true, igstEnabled: true };
  const dTotals = computeTotals(dLines, { type: 'PERCENT', value: 10 }, rates, 'Tamil Nadu', 'Tamil Nadu');
  const sum = (ls: { qty: number; rate: number; discount: number }[]) => ls.reduce((t, l) => t + l.qty * l.rate * (1 - l.discount / 100), 0);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const shown = printedLines(dLines, dTotals, { itemDiscount: true, billDiscount: true });
  check('both discounts shown: lines print as entered', shown === dLines);
  const noItem = printedLines(dLines, dTotals, { itemDiscount: false, billDiscount: true });
  check('item discount hidden: rate printed net, no Disc %, rows still add up', near(noItem[0].rate, 256) && noItem[0].discount === 0 && near(sum(noItem), dTotals.subtotal), noItem);
  const noBill = printedLines(dLines, dTotals, { itemDiscount: true, billDiscount: false });
  check('bill discount hidden: spread into the rates, rows add up to the taxable value', noBill[0].discount === 20 && near(sum(noBill), dTotals.taxable), { noBill, taxable: dTotals.taxable });
  const neither = printedLines(dLines, dTotals, { itemDiscount: false, billDiscount: false });
  check('both hidden: rows add up to the taxable value, total unchanged', neither.every((l) => l.discount === 0) && near(sum(neither), dTotals.taxable) && near(dTotals.total, computeTotals(dLines, { type: 'PERCENT', value: 10 }, rates, 'Tamil Nadu', 'Tamil Nadu').total), neither);

  const pdfSave = await companyActions.updateCompany({}, form({ _fields: 'pdfShowItemDiscount,pdfShowBillDiscount', pdfShowBillDiscount: 'on' }));
  const pdfRow = await coRow();
  check('PDF discount switches save from the Company page', !pdfSave.error && !pdfRow.pdfShowItemDiscount && pdfRow.pdfShowBillDiscount && pdfRow.nextInvoiceNo === 42, { pdfSave, item: pdfRow.pdfShowItemDiscount, bill: pdfRow.pdfShowBillDiscount });


  // ---- tenancy: company B sees none of A's data and can't change any of it
  asOwner();
  const aInvoice = await prisma.invoice.findFirstOrThrow({ where: { status: { not: 'DRAFT' } }, orderBy: { createdAt: 'asc' } });
  const aCounts = { customers: await prisma.customer.count(), products: await prisma.product.count(), invoices: await prisma.invoice.count() };
  const aStock = await stock('p1');
  const aPaid = Number(aInvoice.amountPaid);
  const aUpload = await purchases.uploadPurchaseAttachment(file('a-bill.pdf', 'application/pdf', '%PDF-1.4'));
  const settings = await import('@/lib/settings');
  await settings.setAppSetting('monthlySalesTarget', 123456);
  const aKpis = await (await import('@/actions/dashboard')).getBusinessOverview();

  const coB = await rootPrisma.company.create({ data: { name: 'Other Co', state: 'Karnataka', invoiceFY: '26-27' } });
  const ownerB = await rootPrisma.user.create({ data: { companyId: coB.id, email: 'owner@other', passwordHash: 'x', role: 'OWNER' } });
  const asB = () => (g.__TEST_USER = { id: ownerB.id, role: 'OWNER', companyId: coB.id });
  asB();
  // Refused = an { error } result or a thrown error; the reason is printed so
  // a refusal for some unrelated reason (bad input) is easy to spot.
  const fails = async (label: string, run: () => Promise<unknown>) => {
    try {
      const res = (await run()) as { error?: string } | null | undefined;
      const refused = !!res && typeof res === 'object' && 'error' in res && !!res.error;
      check(`${label}  [${refused ? res!.error : 'NOT refused'}]`, refused, res);
    } catch (e) {
      check(`${label}  [threw ${(e as Error).name}: ${(e as Error).message.split('\n').filter(Boolean).pop()?.slice(0, 90)}]`, true);
    }
  };

  check('B starts empty: no customers, products or invoices of A', (await prisma.customer.count()) === 0 && (await prisma.product.count()) === 0 && (await prisma.invoice.count()) === 0);
  check('B can’t read A’s invoice by id', (await prisma.invoice.findUnique({ where: { id: aInvoice.id } })) === null);
  check('B’s invoice list is empty', (await invoices.listInvoicesPage()).items.length === 0);
  check('B’s search finds nothing of A', JSON.stringify(await (await import('@/actions/search')).globalSearch('Cassata')).includes('Cassata') === false);
  const bKpis = await (await import('@/actions/dashboard')).getBusinessOverview();
  check('A’s dashboard has data to leak', aKpis.invoices.total > 0 && aKpis.money.billed > 0 && aKpis.products.active > 0, aKpis.money);
  check(
    'B’s dashboard (raw SQL) shows none of A’s figures',
    bKpis.invoices.total === 0 && bKpis.money.billed === 0 && bKpis.money.received === 0 && bKpis.products.active === 0 && bKpis.customers.active === 0 && bKpis.suppliers.active === 0 && bKpis.creditNotes.count === 0,
    { invoices: bKpis.invoices.total, money: bKpis.money, products: bKpis.products }
  );
  const reportsMod = await import('@/actions/reports');
  const bStats = (await reportsMod.getReportStats()) as unknown as Record<string, number>;
  check('B’s report totals (raw SQL) are zero', bStats.total === 0 && bStats.invoiceCount === 0 && bStats.outstanding === 0, bStats);
  const bGst = await reportsMod.getGstSummary();
  check('B’s GST summary (raw SQL) is empty', JSON.stringify(bGst).match(/"taxable":[1-9]/) === null, bGst);
  check('B doesn’t see A’s monthly target', (await settings.getAppSettings()).monthlySalesTarget === null);

  await fails('B can’t bill A’s customer', () => invoices.createInvoice({ customerId: 'c1', date: '2026-11-01', due: '2026-11-01', items: [{ productId: null, name: 'X', unit: 'Box', qty: 1, rate: 10, discount: 0 }] }));
  await prisma.customer.create({ data: { id: 'cB', name: 'B Shop', state: 'Karnataka' } });
  await fails('B can’t bill A’s product', () => invoices.createInvoice({ customerId: 'cB', date: '2026-11-01', due: '2026-11-01', items: [{ productId: 'p1', name: 'Cassata', unit: 'Box', qty: 1, rate: 10, discount: 0 }] }));
  await fails('B can’t record a payment on A’s invoice', () => invoices.recordPayment(aInvoice.id, { amount: 1, date: '2026-11-01', mode: 'Cash' }));
  await fails('B can’t delete A’s invoice', () => invoices.deleteInvoice(aInvoice.id));
  await fails('B can’t move A’s stock', () => inventory.addStockMovement('p1', { type: 'ADJUSTMENT', qty: -5, unit: 'Box', date: '2026-11-01' }));
  await fails('B can’t raise a credit note on A’s invoice', () => creditNotes.getCreditNoteSource(aInvoice.id).then((r) => (r.source ? {} : { error: 'none' })));
  await fails('B can’t read A’s customer statement', () => statements.getCustomerStatement('c1').then((r) => (r.statement ? {} : { error: 'none' })));
  await fails('B can’t create a row for A by naming its companyId', () => prisma.customer.create({ data: { name: 'Sneaky', state: 'Karnataka', companyId: coA.id } }));
  await fails('B can’t update A’s customer directly', () => prisma.customer.update({ where: { id: 'c1' }, data: { name: 'Hacked' } }));
  await fails('B can’t connect A’s customer in a nested write', () =>
    prisma.invoice.create({ data: { number: 'X-1', date: new Date(), due: new Date(), customer: { connect: { id: 'c1' } } } })
  );
  const team = await import('@/actions/team');
  await rootPrisma.user.update({ where: { id: staff.id }, data: { email: 'staff@a-co.in' } });
  await fails('B can’t add a login using A’s staff email (any case)', () => team.createLogin({ name: 'Copy', email: 'STAFF@A-co.in', phone: '', password: 'secret12', role: 'STAFF' }));
  const bLogin = await team.createLogin({ name: 'B Staff', email: 'staff@b-co.in', phone: '', password: 'secret12', role: 'STAFF' });
  check('B adds its own staff login, in company B', !bLogin.error && (await rootPrisma.user.findUniqueOrThrow({ where: { id: bLogin.id! } })).companyId === coB.id, bLogin);
  check('B’s team list has only B’s logins', (await team.listLogins()).users?.every((u) => u.id === ownerB.id || u.id === bLogin.id) === true);
  await purchases.discardPurchaseUploads([aUpload.attachment!.url]);
  check('B can’t delete A’s uploaded file', onDisk(aUpload.attachment!.url));

  const bProduct = await prisma.product.create({ data: { id: 'pB', name: 'B Ice', category: 'Ice', unit: 'Box', price: 10 } });
  const bInv = await invoices.createInvoice({ customerId: 'cB', date: '2026-11-01', due: '2026-11-01', items: [{ productId: bProduct.id, name: 'B Ice', unit: 'Box', qty: 2, rate: 10, discount: 0 }] });
  const bRow = bInv.invoiceId ? await prisma.invoice.findUnique({ where: { id: bInv.invoiceId } }) : null;
  check('B bills its own customer and product', !bInv.error && !!bRow && bRow.companyId === coB.id, bInv);
  check('B’s invoice numbers start at 1 independently of A', bRow?.number.endsWith('0001') === true, bRow?.number);
  let rawRefused = false;
  try {
    await prisma.$queryRaw`SELECT count(*) FROM "Invoice"`;
  } catch {
    rawRefused = true;
  }
  check('raw SQL without a companyId filter is refused', rawRefused);

  asOwner();
  const aAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: aInvoice.id } });
  check('A’s data is untouched', (await stock('p1')) === aStock && Number(aAfter.amountPaid) === aPaid && (await prisma.customer.findUniqueOrThrow({ where: { id: 'c1' } })).name === 'Shop', { stock: await stock('p1'), paid: aAfter.amountPaid });
  check('A still sees only its own rows', (await prisma.customer.count()) === aCounts.customers && (await prisma.product.count()) === aCounts.products && (await prisma.invoice.count()) === aCounts.invoices);
  check('A’s monthly target is still set', (await settings.getAppSettings()).monthlySalesTarget === 123456);
  const { createSignedToken, verifySignedToken } = await import('@/lib/signed-token');
  check('signed tokens carry the company they were made for', verifySignedToken('print-invoice', await createSignedToken('print-invoice', aInvoice.id, 60))?.companyId === coA.id);

  // ---- review fixes: sign-in throttle, identifiers, modules, owner-only settings
  const { lockoutKey } = await import('@/lib/login-rate-limit');
  check('every spelling of a phone shares one lockout counter', ['98400 12345', '98400-12345', '(98400)12345', '9840012345'].every((v) => lockoutKey(v) === '9840012345'));
  check('emails share one counter regardless of case', lockoutKey(' Owner@Test.IN ') === 'owner@test.in');
  check('the platform admin’s counter is separate from any company login', lockoutKey('boss@platform.in', 'admin') !== lockoutKey('boss@platform.in'));
  process.env.ADMIN_EMAIL = 'boss@platform.in';
  asOwner();
  const reserved = await team.createLogin({ name: 'Fake admin', email: 'Boss@Platform.in', phone: '', password: 'secret12', role: 'STAFF' });
  check('the admin’s email can’t become a company login', !!reserved.fieldErrors?.email, reserved);
  const { signUp } = await import('@/actions/auth');
  const signupForm = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const emailAsPhone = await signUp({}, signupForm({ companyName: 'Shadow', state: 'Goa', phone: 'staff@a-co.in', password: 'secret12' }));
  check('an email can’t be saved as a phone (no shadowing another login)', !!emailAsPhone.fieldErrors?.phone, emailAsPhone);
  const adminAtSignup = await signUp({}, signupForm({ companyName: 'Shadow', state: 'Goa', email: 'boss@platform.in', password: 'secret12' }));
  check('signup refuses the admin’s email', !!adminAtSignup.fieldErrors?.email, adminAtSignup);
  const spacedPhone = await signUp({}, signupForm({ companyName: 'Phone Co', state: 'Goa', phone: '98765 43210', password: 'secret12' }));
  const phoneUser = await rootPrisma.user.findFirst({ where: { phone: '9876543210' } });
  check('signup stores a phone without spacing', !spacedPhone.error && !!phoneUser, spacedPhone);

  asStaff();
  const staffCompany = await companyActions.updateCompany({}, form({ _fields: 'bankAcc', bankAcc: '999' }));
  check('staff can’t change company settings', !!staffCompany.error && (await coRow()).bankAcc !== '999', staffCompany);
  check('staff can’t change company GST defaults', !!(await companyActions.updateCompanyGstDefaults({ cgstRate: 1, sgstRate: 1, igstRate: 2, cgstEnabled: true, sgstEnabled: true, igstEnabled: true, pdfShowBankDetails: true, pdfShowHsnSummary: false, showUpiQr: false, showGpayNumber: false })).error);
  asOwner();

  await rootPrisma.company.update({ where: { id: coA.id }, data: { disabledModules: ['purchases', 'team', 'reports', 'returns', 'inventory'] } });
  const refusedOff = async (label: string, run: () => Promise<unknown>) => {
    try {
      const res = (await run()) as { error?: string } | null;
      check(`${label}  [${res && typeof res === 'object' && 'error' in res ? res.error : 'NOT refused'}]`, !!res && typeof res === 'object' && /isn’t enabled/.test(String(res.error)), res);
    } catch (e) {
      check(`${label}  [threw: ${(e as Error).message}]`, /isn’t enabled/.test((e as Error).message));
    }
  };
  await refusedOff('module off: purchases list refused', () => purchases.listPurchasesPage());
  await refusedOff('module off: saving a purchase refused', () => purchases.savePurchase(null, { supplierId: 's1', date: '2026-11-01', items: [line], attachments: [] }));
  await refusedOff('module off: adding a team login refused', () => team.createLogin({ name: 'X', email: 'x@a-co.in', phone: '', password: 'secret12', role: 'STAFF' }));
  await refusedOff('module off: report figures refused', () => reportsMod.getReportStats());
  await refusedOff('module off: credit notes refused', () => creditNotes.listCreditNotesPage());
  await refusedOff('module off: stock adjustments refused', () => inventory.addStockMovement('p1', { type: 'ADJUSTMENT', qty: 1, unit: 'Box', date: '2026-11-01' }));
  check('module off: the dashboard still loads', (await (await import('@/actions/dashboard')).getBusinessOverview()).invoices.total > 0);
  check('module off: billing still works', !(await invoices.createInvoice(bill(1, {}, 'p2'))).error);
  await rootPrisma.company.update({ where: { id: coA.id }, data: { disabledModules: [] } });
  check('module back on: purchases work again', Array.isArray((await purchases.listPurchasesPage()).items));

  g.__TEST_USER = undefined;
  let noTenant = false;
  try {
    await prisma.customer.count();
  } catch (e) {
    noTenant = (e as Error).name === 'TenantMissingError';
  }
  check('with nobody signed in, every query is refused', noTenant);

  await prisma.$disconnect();
  fs.rmSync(work, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
