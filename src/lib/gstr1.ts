import type { CsvCell } from './csv';
import { gstStateCode, gstinStateKey } from './gst-state-codes';

// GSTR-1 in the GST portal's offline-tool CSV layout — one file per section
// (B2B, B2CL, B2CS, HSN, CDNR, Docs), each with the tool's own column
// headings, so the accountant can import them into the offline utility (or
// check them against the portal) instead of retyping every invoice.
//
// Pure: no database here, so the section list can be shown in the browser
// and the builders can be checked without a server. The route that loads
// the invoices is src/app/api/export/gstr1/[section]/route.ts.
//
// Rules this app's data needs (one tax rate per invoice, ice cream at 18%):
// - A customer with a GSTIN is registered (B2B / CDNR); anyone else is B2C.
// - B2CL is an inter-state invoice to an unregistered buyer above
//   B2CL_LIMIT; every other B2C invoice is summarised in B2CS by place of
//   supply and rate.
// - Credit notes to registered buyers go in CDNR; those to unregistered
//   buyers are netted into B2CS (the portal's rule for B2C small — this
//   business has no inter-state B2C invoices large enough for CDNUR).
// - HSN is split B2B / B2C (the portal's Table 12 has asked for the two
//   separately since 2025), net of credit notes.

/** Inter-state B2C invoices above this go invoice-wise in B2CL. ₹1 lakh
 * since August 2024 (Notification 12/2024–CT amended rule 59(4)); it was
 * ₹2.5 lakh before. */
export const B2CL_LIMIT = 100_000;

export type Gstr1Section = 'b2b' | 'b2cl' | 'b2cs' | 'hsn-b2b' | 'hsn-b2c' | 'cdnr' | 'docs';

export const GSTR1_SECTIONS: { id: Gstr1Section; label: string; hint: string }[] = [
  { id: 'b2b', label: 'B2B invoices', hint: 'Invoice-wise, for customers with a GSTIN (4A)' },
  { id: 'b2cl', label: 'B2C large', hint: 'Inter-state invoices above ₹1 lakh to buyers without a GSTIN (5)' },
  { id: 'b2cs', label: 'B2C small', hint: 'All other B2C sales by state and rate, less credit notes (7)' },
  { id: 'hsn-b2b', label: 'HSN summary · B2B', hint: 'HSN-wise totals of B2B supplies (12)' },
  { id: 'hsn-b2c', label: 'HSN summary · B2C', hint: 'HSN-wise totals of B2C supplies (12)' },
  { id: 'cdnr', label: 'Credit notes · registered', hint: 'Credit notes to customers with a GSTIN (9B)' },
  { id: 'docs', label: 'Documents issued', hint: 'Invoice and credit-note number ranges, with cancelled (13)' },
];

export function isGstr1Section(v: string): v is Gstr1Section {
  return GSTR1_SECTIONS.some((s) => s.id === v);
}

type Party = { name: string; shopName: string | null; gstin: string | null; state: string };
type Line = { hsn: string; name: string; unit: string; qty: number; /** Pre-tax line value before the document's own discount spread. */ value: number };

/** An issued invoice or a credit note, already reduced to what GSTR-1
 * needs. `rate` is the document's total GST rate (CGST + SGST, or IGST). */
export type Gstr1Doc = {
  number: string;
  date: Date;
  total: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  interState: boolean;
  rate: number;
  party: Party;
  lines: Line[];
};

export type Gstr1Data = {
  invoices: Gstr1Doc[];
  creditNotes: Gstr1Doc[];
  /** Every issued invoice / credit-note number, whatever its date — so a
   * number inside this period's range that belongs to a back-dated
   * document isn't mistaken for a cancelled one. */
  issuedNumbers: { invoices: string[]; creditNotes: string[] };
};

export type Gstr1Sheet = { header: string[]; rows: CsvCell[][] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const isRegistered = (p: Party) => !!p.gstin?.trim();
const gstin = (p: Party) => p.gstin!.trim().toUpperCase();
/** The legal name the portal matches against — the person's or firm's name,
 * which for a shop is usually the shop name. */
const receiverName = (p: Party) => (p.shopName || p.name).trim();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "03-Nov-2026" — the offline tool's date format. Document dates are
 * stored at UTC midnight of their calendar day. */
export function gstr1Date(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/** Lower-case words the portal keeps lower-case in state names. */
const SMALL_WORDS = new Set(['and', 'of']);

/** "33-Tamil Nadu" — place of supply as the offline tool lists it: the
 * state code, a hyphen, and the state's name. The customer's state, or the
 * state their GSTIN was issued in when the stored name isn't recognised. */
export function placeOfSupply(p: Party): string {
  let key = p.state.trim().toLowerCase();
  if (gstStateCode(key) === '99' && p.gstin) key = gstinStateKey(p.gstin) ?? key;
  const name = key
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
  return `${gstStateCode(key)}-${name}`;
}

/** Unit Quantity Codes from the portal's list, by the units this app's
 * invoices use. Anything unrecognised is OTH-OTHERS. */
const UQC: Record<string, string> = {
  box: 'BOX-BOX',
  boxes: 'BOX-BOX',
  piece: 'PCS-PIECES',
  pieces: 'PCS-PIECES',
  pc: 'PCS-PIECES',
  pcs: 'PCS-PIECES',
  nos: 'NOS-NUMBERS',
  no: 'NOS-NUMBERS',
  kg: 'KGS-KILOGRAMS',
  kgs: 'KGS-KILOGRAMS',
  g: 'GMS-GRAMMES',
  gm: 'GMS-GRAMMES',
  gms: 'GMS-GRAMMES',
  ltr: 'LTR-LITRES',
  litre: 'LTR-LITRES',
  liter: 'LTR-LITRES',
  l: 'LTR-LITRES',
  ml: 'MLT-MILILITRE',
  packet: 'PAC-PACKS',
  packets: 'PAC-PACKS',
  pkt: 'PAC-PACKS',
  pack: 'PAC-PACKS',
  bag: 'BAG-BAGS',
  bags: 'BAG-BAGS',
  bottle: 'BTL-BOTTLES',
  btl: 'BTL-BOTTLES',
  can: 'CAN-CANS',
  carton: 'CTN-CARTONS',
  ctn: 'CTN-CARTONS',
  dozen: 'DOZ-DOZENS',
  doz: 'DOZ-DOZENS',
};

export function uqcOf(unit: string): string {
  return UQC[unit.trim().toLowerCase()] ?? 'OTH-OTHERS';
}

/** Splits `n` across a document's lines in proportion to their value — how
 * the invoice-level discount and the stored tax heads are shared out, so
 * per-HSN figures add back up to the document's own totals. */
function share(doc: Gstr1Doc, line: Line, n: number): number {
  const sub = doc.lines.reduce((s, l) => s + l.value, 0);
  return sub > 0 ? (n * line.value) / sub : 0;
}

/** B2C invoices that belong in B2CL rather than the B2CS summary. */
const isB2cl = (d: Gstr1Doc) => !isRegistered(d.party) && d.interState && d.total > B2CL_LIMIT;

// ---- sections -----------------------------------------------------------------

function b2b(data: Gstr1Data): Gstr1Sheet {
  return {
    header: ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'],
    rows: data.invoices
      .filter((d) => isRegistered(d.party))
      .map((d) => [gstin(d.party), receiverName(d.party), d.number, gstr1Date(d.date), r2(d.total), placeOfSupply(d.party), 'N', '', 'Regular B2B', '', d.rate, r2(d.taxable), 0]),
  };
}

function b2cl(data: Gstr1Data): Gstr1Sheet {
  return {
    header: ['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
    rows: data.invoices.filter(isB2cl).map((d) => [d.number, gstr1Date(d.date), r2(d.total), placeOfSupply(d.party), '', d.rate, r2(d.taxable), 0, '']),
  };
}

function b2cs(data: Gstr1Data): Gstr1Sheet {
  const groups = new Map<string, { pos: string; rate: number; taxable: number }>();
  const add = (d: Gstr1Doc, sign: 1 | -1) => {
    const pos = placeOfSupply(d.party);
    const k = `${pos}|${d.rate}`;
    const g = groups.get(k) ?? { pos, rate: d.rate, taxable: 0 };
    g.taxable += sign * d.taxable;
    groups.set(k, g);
  };
  for (const d of data.invoices) if (!isRegistered(d.party) && !isB2cl(d)) add(d, 1);
  for (const d of data.creditNotes) if (!isRegistered(d.party)) add(d, -1);
  return {
    header: ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
    rows: [...groups.values()]
      .filter((g) => Math.abs(g.taxable) > 0.004)
      .sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate)
      .map((g) => ['OE', g.pos, '', g.rate, r2(g.taxable), 0, '']),
  };
}

/** HSN-wise totals for registered (`b2b`) or unregistered buyers, invoices
 * less credit notes, one row per HSN × unit code × rate. */
function hsn(data: Gstr1Data, registered: boolean): Gstr1Sheet {
  type Row = { hsn: string; uqc: string; rate: number; qty: number; taxable: number; igst: number; cgst: number; sgst: number; names: Map<string, number> };
  const rows = new Map<string, Row>();
  const add = (d: Gstr1Doc, sign: 1 | -1) => {
    for (const l of d.lines) {
      const uqc = uqcOf(l.unit);
      const k = `${l.hsn}|${uqc}|${d.rate}`;
      const row = rows.get(k) ?? { hsn: l.hsn, uqc, rate: d.rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, names: new Map() };
      const taxable = share(d, l, d.taxable);
      row.qty += sign * l.qty;
      row.taxable += sign * taxable;
      row.igst += sign * share(d, l, d.igst);
      row.cgst += sign * share(d, l, d.cgst);
      row.sgst += sign * share(d, l, d.sgst);
      row.names.set(l.name, (row.names.get(l.name) ?? 0) + taxable);
      rows.set(k, row);
    }
  };
  for (const d of data.invoices) if (isRegistered(d.party) === registered) add(d, 1);
  for (const d of data.creditNotes) if (isRegistered(d.party) === registered) add(d, -1);
  return {
    header: ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'],
    rows: [...rows.values()]
      .filter((r) => Math.abs(r.taxable) > 0.004 || Math.abs(r.qty) > 1e-6)
      .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.uqc.localeCompare(b.uqc) || a.rate - b.rate)
      .map((r) => {
        // Described by its best-selling item — the portal's HSN master
        // supplies the official text; this just helps a reader.
        const description = [...r.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        return [r.hsn, description, r.uqc, r2(r.qty), r2(r.taxable + r.igst + r.cgst + r.sgst), r.rate, r2(r.taxable), r2(r.igst), r2(r.cgst), r2(r.sgst), 0];
      }),
  };
}

function cdnr(data: Gstr1Data): Gstr1Sheet {
  return {
    header: ['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
    rows: data.creditNotes
      .filter((d) => isRegistered(d.party))
      .map((d) => [gstin(d.party), receiverName(d.party), d.number, gstr1Date(d.date), 'C', placeOfSupply(d.party), 'N', 'Regular B2B', r2(d.total), '', d.rate, r2(d.taxable), 0]),
  };
}

/** "INV/2026-27/0042" → series "INV/2026-27/" and serial 42. */
function serialOf(number: string): { series: string; seq: number } | null {
  const m = /^(.*?)(\d+)$/.exec(number);
  return m ? { series: m[1], seq: Number(m[2]) } : null;
}

/** Number ranges per series ("INV/2026-27/" …), as Table 13 wants them:
 * first and last number issued in the period, how many numbers that range
 * spans, and how many of those were never issued at all — deleted, or
 * still a draft — which the portal counts as cancelled. */
function docs(data: Gstr1Data): Gstr1Sheet {
  const rows: CsvCell[][] = [];
  const series = (nature: string, numbers: string[], everIssued: string[]) => {
    const issued = new Set(everIssued.map(serialOf).filter((x) => x !== null).map((x) => `${x.series}#${x.seq}`));
    const bySeries = new Map<string, { seq: number; number: string }[]>();
    const unparsed: string[] = [];
    for (const n of numbers) {
      const sn = serialOf(n);
      if (!sn) {
        unparsed.push(n);
        continue;
      }
      const list = bySeries.get(sn.series) ?? [];
      list.push({ seq: sn.seq, number: n });
      bySeries.set(sn.series, list);
    }
    for (const [prefix, list] of bySeries) {
      list.sort((a, b) => a.seq - b.seq);
      const first = list[0];
      const last = list[list.length - 1];
      let cancelled = 0;
      for (let seq = first.seq; seq <= last.seq; seq++) if (!issued.has(`${prefix}#${seq}`) && !list.some((x) => x.seq === seq)) cancelled++;
      rows.push([nature, first.number, last.number, last.seq - first.seq + 1, cancelled]);
    }
    // Numbers without a running serial can't form a range — listed alone.
    for (const n of unparsed.sort()) rows.push([nature, n, n, 1, 0]);
  };
  series('Invoices for outward supply', data.invoices.map((d) => d.number), data.issuedNumbers.invoices);
  series('Credit Note', data.creditNotes.map((d) => d.number), data.issuedNumbers.creditNotes);
  return { header: ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'], rows };
}

/** One GSTR-1 section, ready for csvRow. */
export function buildGstr1Section(section: Gstr1Section, data: Gstr1Data): Gstr1Sheet {
  switch (section) {
    case 'b2b':
      return b2b(data);
    case 'b2cl':
      return b2cl(data);
    case 'b2cs':
      return b2cs(data);
    case 'hsn-b2b':
      return hsn(data, true);
    case 'hsn-b2c':
      return hsn(data, false);
    case 'cdnr':
      return cdnr(data);
    case 'docs':
      return docs(data);
  }
}
