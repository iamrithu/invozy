// Runs the real stock and purchase-attachment server actions against a
// throwaway local Postgres and checks what they do to stock and storage.
//
//   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/asb_test npm run test:actions
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
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'asb-test-actions-'));
  process.chdir(work);

  const { prisma } = await import('@/lib/prisma');
  const invoices = await import('@/actions/invoices');
  const purchases = await import('@/actions/purchases');
  const inventory = await import('@/actions/inventory');
  const g = globalThis as { __TEST_USER?: { id: string; role: 'OWNER' | 'STAFF' } };

  const stock = async (id = 'p1') => Number((await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty);

  // ---- fixtures
  await prisma.company.create({ data: { id: 'main', name: 'Test Co', state: 'Tamil Nadu', invoiceFY: '26-27' } });
  const owner = await prisma.user.create({ data: { email: 'owner@test', passwordHash: 'x', role: 'OWNER' } });
  const staff = await prisma.user.create({ data: { email: 'staff@test', passwordHash: 'x', role: 'STAFF' } });
  const asOwner = () => (g.__TEST_USER = { id: owner.id, role: 'OWNER' });
  const asStaff = () => (g.__TEST_USER = { id: staff.id, role: 'STAFF' });
  asOwner();
  await prisma.customer.create({ data: { id: 'c1', name: 'Shop', state: 'Tamil Nadu' } });
  await prisma.product.create({ data: { id: 'p1', name: 'Cassata', category: 'Ice', unit: 'Box', price: 100, trackStock: true, stockQty: 100 } });
  await prisma.product.create({ data: { id: 'p2', name: 'Kulfi', category: 'Ice', unit: 'Box', price: 50, trackStock: true, stockQty: 50 } });
  await prisma.product.create({ data: { id: 'p3', name: 'Cone', category: 'Ice', unit: 'Box', price: 80, trackStock: true, stockQty: 20 } });
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

  await prisma.$disconnect();
  fs.rmSync(work, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
