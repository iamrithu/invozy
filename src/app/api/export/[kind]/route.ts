import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvHeaders, csvStream, exportFileName, type CsvCell } from '@/lib/csv';
import { todayIst } from '@/lib/dates';
import { customerDisplayName } from '@/lib/customer';
import { formatStock } from '@/lib/stock-units';
import { STATUS_LABEL } from '@/lib/report-status';
import { averagePurchaseCosts, loadProductMeta, mainQtyOf, type ProductMeta } from '@/app/(app)/reports/report-data';
import { ownerGate, parseRange, type ExportRange } from '../export-utils';
import { currentCompanyId } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Spreadsheet exports for the owner — `/api/export/<kind>?from=&to=` with
 * the Reports page's current date range (both optional). Each streams a
 * UTF-8 CSV (with BOM, see src/lib/csv.ts) built page by page from the
 * database. Amounts are plain numbers so Excel can sum them; dates are
 * YYYY-MM-DD in IST.
 *
 * Invoices and their lines skip drafts, same as every report: a draft isn't
 * a sale yet. Customers and products are snapshots of today and ignore
 * the range.
 */

const PAGE = 1000;

type Exporter = {
  /** Snapshot exports are named by today's date, not the range. */
  snapshot?: boolean;
  header: string[];
  rows: (range: ExportRange) => AsyncIterable<CsvCell[][]>;
};

/** Pages through a query by `id` cursor in the query's own ORDER BY (which
 * must end in `id` so the cursor is stable). `map` turns one record into
 * CSV rows — usually one; an invoice becomes one row per line item. */
async function* paged<T extends { id: string }>(
  fetch: (page: { take: number; skip?: number; cursor?: { id: string } }) => Promise<T[]>,
  map: (row: T) => CsvCell[][]
): AsyncIterable<CsvCell[][]> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetch({ take: PAGE, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const out = rows.flatMap(map);
    if (out.length) yield out;
    if (rows.length < PAGE) return;
    cursor = rows[rows.length - 1].id;
  }
}

const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
const gstType = (gstin: string | null | undefined) => (gstin?.trim() ? 'B2B' : 'B2C');

const EXPORTS: Record<string, Exporter> = {
  invoices: {
    header: [
      'Invoice no', 'Date', 'Due date', 'Status', 'Customer', 'Contact name', 'GSTIN', 'B2B/B2C', 'State', 'Route', 'Tax type',
      'Taxable value', 'CGST', 'SGST', 'IGST', 'Round off', 'Invoice total', 'Paid', 'Balance due', 'Vehicle no', 'IRN', 'e-Way Bill no', 'Notes',
    ],
    rows: (range) =>
      paged(
        (page) =>
          prisma.invoice.findMany({
            ...page,
            where: { status: { not: 'DRAFT' }, ...(range.dateWhere ? { date: range.dateWhere } : {}) },
            orderBy: [{ date: 'asc' }, { number: 'asc' }, { id: 'asc' }],
            select: {
              id: true, number: true, date: true, due: true, status: true, taxable: true, cgst: true, sgst: true, igst: true, total: true,
              amountPaid: true, interState: true, transportVehicleNo: true, vehicleNo: true, irn: true, ewbNo: true, notes: true,
              customer: { select: { name: true, shopName: true, gstin: true, state: true, route: true } },
            },
          }),
        (i) => {
          const taxes = n(i.cgst) + n(i.sgst) + n(i.igst);
          return [[
            i.number, i.date, i.due, statusLabel(i.status), customerDisplayName(i.customer), i.customer.shopName ? i.customer.name : '',
            i.customer.gstin, gstType(i.customer.gstin), i.customer.state, i.customer.route, i.interState ? 'IGST' : 'CGST + SGST',
            n(i.taxable), n(i.cgst), n(i.sgst), n(i.igst), n(n(i.total) - n(i.taxable) - taxes), n(i.total), n(i.amountPaid),
            Math.max(n(n(i.total) - n(i.amountPaid)), 0), i.transportVehicleNo || i.vehicleNo, i.irn, i.ewbNo, i.notes,
          ]];
        }
      ),
  },

  'invoice-items': {
    header: [
      'Invoice no', 'Date', 'Status', 'Customer', 'GSTIN', 'Product', 'Category', 'HSN', 'Qty', 'Unit', 'Rate', 'Discount %',
      'Line amount (before invoice discount)', 'Qty in main unit', 'Main unit', 'Batch',
    ],
    rows: async function* (range) {
      const products = await loadProductMeta();
      // Paged by invoice (lines nested) so rows come out in invoice order
      // without sorting lines through a relation.
      yield* paged(
        (page) =>
          prisma.invoice.findMany({
            ...page,
            where: { status: { not: 'DRAFT' }, ...(range.dateWhere ? { date: range.dateWhere } : {}) },
            orderBy: [{ date: 'asc' }, { number: 'asc' }, { id: 'asc' }],
            select: {
              id: true, number: true, date: true, status: true,
              customer: { select: { name: true, shopName: true, gstin: true } },
              items: { select: { productId: true, name: true, unit: true, qty: true, rate: true, discount: true, hsn: true, batch: true, stockQty: true }, orderBy: { id: 'asc' } },
            },
          }),
        (inv) =>
          inv.items.map((it) => {
            const p = it.productId ? products.get(it.productId) : undefined;
            const qty = Number(it.qty);
            const main = p ? mainQtyOf({ qty, unit: it.unit, stockQty: it.stockQty == null ? null : Number(it.stockQty) }, p) : null;
            return [
              inv.number, inv.date, statusLabel(inv.status), customerDisplayName(inv.customer), inv.customer.gstin,
              it.name, p?.category, it.hsn, qty, it.unit, n(it.rate), Number(it.discount), n(qty * Number(it.rate) * (1 - Number(it.discount) / 100)),
              main, p?.unit, it.batch,
            ];
          })
      );
    },
  },

  payments: {
    header: ['Receipt no', 'Payment date', 'Amount', 'Mode', 'Reference', 'Invoice no', 'Invoice date', 'Customer', 'Credit note no'],
    rows: (range) =>
      paged(
        (page) =>
          prisma.payment.findMany({
            ...page,
            where: range.dateWhere ? { date: range.dateWhere } : undefined,
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true, date: true, amount: true, mode: true, reference: true, receiptNo: true,
              creditNote: { select: { number: true } },
              invoice: { select: { number: true, date: true, customer: { select: { name: true, shopName: true } } } },
            },
          }),
        (p) => [
          [p.receiptNo, p.date, n(p.amount), p.mode, p.reference, p.invoice.number, p.invoice.date, customerDisplayName(p.invoice.customer), p.creditNote?.number],
        ]
      ),
  },

  'credit-notes': {
    header: ['Credit note no', 'Date', 'Against invoice', 'Customer', 'GSTIN', 'B2B/B2C', 'Reason', 'Restocked', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total', 'Refund due'],
    rows: (range) =>
      paged(
        (page) =>
          prisma.creditNote.findMany({
            ...page,
            where: range.dateWhere ? { date: range.dateWhere } : undefined,
            orderBy: [{ date: 'asc' }, { number: 'asc' }, { id: 'asc' }],
            select: {
              id: true, number: true, date: true, invoiceNumber: true, reason: true, restock: true, taxable: true, cgst: true, sgst: true, igst: true, total: true, refundDue: true,
              invoice: { select: { number: true } },
              customer: { select: { name: true, shopName: true, gstin: true } },
            },
          }),
        (c) => [
          [
            c.number, c.date, c.invoice?.number ?? c.invoiceNumber, customerDisplayName(c.customer), c.customer.gstin, gstType(c.customer.gstin), c.reason, c.restock,
            n(c.taxable), n(c.cgst), n(c.sgst), n(c.igst), n(c.total), n(c.refundDue),
          ],
        ]
      ),
  },

  purchases: {
    header: ['Bill no', 'Date', 'Supplier', 'Supplier GSTIN', 'Lines', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total', 'Notes'],
    rows: (range) =>
      paged(
        (page) =>
          prisma.purchase.findMany({
            ...page,
            where: range.dateWhere ? { date: range.dateWhere } : undefined,
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true, billNo: true, date: true, taxable: true, cgst: true, sgst: true, igst: true, total: true, notes: true,
              supplier: { select: { name: true, gstin: true } },
              _count: { select: { items: true } },
            },
          }),
        (p) => [[p.billNo, p.date, p.supplier.name, p.supplier.gstin, p._count.items, n(p.taxable), n(p.cgst), n(p.sgst), n(p.igst), n(p.total), p.notes]]
      ),
  },

  customers: {
    snapshot: true,
    header: [
      'Shop name', 'Name', 'Phone', 'Alt phone', 'Email', 'GSTIN', 'State', 'District', 'Address', 'Pincode', 'Route', 'Payment terms',
      'Credit limit', 'Invoices', 'Total billed', 'Balance due', 'Active',
    ],
    rows: async function* () {
      // Balances in one aggregate up front rather than one query per row.
      const totals = await prisma.$queryRaw<{ customerId: string; count: number; billed: number; balance: number }[]>`
        SELECT "customerId", COUNT(*)::int AS "count", SUM(total)::float8 AS "billed", SUM(GREATEST(total - "amountPaid", 0))::float8 AS "balance"
        FROM "Invoice" WHERE "companyId" = ${await currentCompanyId()} AND status <> 'DRAFT' GROUP BY 1`;
      const byCustomer = new Map(totals.map((t) => [t.customerId, t]));
      yield* paged(
        (page) =>
          prisma.customer.findMany({
            ...page,
            where: { guest: false },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            select: {
              id: true, name: true, shopName: true, phone: true, altPhone: true, email: true, gstin: true, state: true, district: true, address: true,
              pincode: true, route: true, terms: true, creditLimit: true, active: true,
            },
          }),
        (c) => {
          const t = byCustomer.get(c.id);
          return [[
            c.shopName, c.name, c.phone, c.altPhone, c.email, c.gstin, c.state, c.district, c.address, c.pincode, c.route, c.terms,
            n(c.creditLimit), t?.count ?? 0, n(t?.billed), n(t?.balance), c.active,
          ]];
        }
      );
    },
  },

  products: {
    snapshot: true,
    header: [
      'Product', 'Category', 'HSN', 'Main unit', 'Price (main unit)', 'Other units', 'Pieces per main unit', 'Stock tracked', 'Stock (main units)',
      'Stock', 'Low-stock alert at', 'Avg purchase cost (main unit)', 'Stock value at cost', 'Active',
    ],
    rows: async function* () {
      const meta = await loadProductMeta();
      const costs = await averagePurchaseCosts(meta);
      yield* paged(
        (page) =>
          prisma.product.findMany({
            ...page,
            orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
            select: {
              id: true, name: true, category: true, hsn: true, unit: true, price: true, packQty: true, trackStock: true, stockQty: true, lowStockAt: true, active: true,
              priceTiers: { select: { unit: true, price: true, approxQty: true }, orderBy: { sortOrder: 'asc' } },
            },
          }),
        (p) => {
          const m = meta.get(p.id) as ProductMeta;
          const stock = Number(p.stockQty);
          const cost = costs.get(p.id);
          const others = p.priceTiers
            .filter((t) => t.unit.trim().toLowerCase() !== p.unit.trim().toLowerCase())
            .map((t) => `${t.unit} @ ${n(t.price)}`)
            .join('; ');
          const mainTier = p.priceTiers.find((t) => t.unit.trim().toLowerCase() === p.unit.trim().toLowerCase());
          const pieces = Number(mainTier?.approxQty ?? p.packQty ?? 0) || null;
          return [[
            p.name, p.category, p.hsn, p.unit, n(p.price), others, pieces, p.trackStock, p.trackStock ? stock : null, p.trackStock && m ? formatStock(stock, m) : null,
            p.lowStockAt == null ? null : Number(p.lowStockAt), cost == null ? null : n(cost), p.trackStock && cost != null ? n(cost * stock) : null, p.active,
          ]];
        }
      );
    },
  },

  'stock-movements': {
    header: ['Date', 'Product', 'Category', 'Type', 'Qty (main units)', 'Qty', 'Balance after', 'Unit cost', 'Document', 'Reference', 'Batch', 'Expiry', 'Note', 'By'],
    rows: async function* (range) {
      const meta = await loadProductMeta();
      const TYPE: Record<string, string> = {
        OPENING: 'Opening stock', PURCHASE: 'Purchase', PURCHASE_RETURN: 'Purchase return', SALE: 'Sale', SALE_RETURN: 'Sale return', ADJUSTMENT: 'Adjustment', DAMAGE: 'Damage',
      };
      yield* paged(
        (page) =>
          prisma.stockMovement.findMany({
            ...page,
            where: range.dateWhere ? { date: range.dateWhere } : undefined,
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true, productId: true, type: true, qty: true, balanceAfter: true, unitCost: true, invoiceNumber: true, reference: true, batchNo: true,
              expiryDate: true, note: true, date: true,
              product: { select: { name: true, category: true } },
              purchase: { select: { billNo: true } },
              creditNote: { select: { number: true } },
              user: { select: { name: true, email: true, phone: true } },
            },
          }),
        (m) => {
          const p = meta.get(m.productId);
          const qty = Number(m.qty);
          const doc = m.invoiceNumber ? `Invoice ${m.invoiceNumber}` : m.creditNote ? `Credit note ${m.creditNote.number}` : m.purchase ? `Bill ${m.purchase.billNo ?? ''}`.trim() : '';
          return [[
            m.date, m.product.name, m.product.category, TYPE[m.type] ?? m.type, qty, p ? formatStock(qty, p) : null, Number(m.balanceAfter),
            m.unitCost == null ? null : n(m.unitCost), doc, m.reference, m.batchNo, m.expiryDate, m.note, m.user ? m.user.name || m.user.email || m.user.phone : '',
          ]];
        }
      );
    },
  },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const denied = await ownerGate();
  if (denied) return denied;

  const { kind } = await params;
  const exporter = Object.prototype.hasOwnProperty.call(EXPORTS, kind) ? EXPORTS[kind] : undefined;
  if (!exporter) return Response.json({ error: 'Unknown export' }, { status: 404 });

  const range = parseRange(req.nextUrl);
  const fileName = exportFileName(kind, range, 'csv', exporter.snapshot ? todayIst() : undefined);
  return new Response(csvStream(exporter.header, exporter.rows(range)), { headers: csvHeaders(fileName) });
}
