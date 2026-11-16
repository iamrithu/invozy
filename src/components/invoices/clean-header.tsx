'use client';

import { fmtInr, formatInvoiceDate } from '@/lib/gst';
import { gstStateCode } from '@/lib/gst-state-codes';

// ---------------------------------------------------------------------------
// CLEAN template building blocks — the letterhead below, plus the few style
// tokens every CLEAN section in invoice-sheet-classic.tsx shares.
//
// The template's whole idea is restraint: ONE 1px rule colour everywhere
// (row separators inside tables use the same 1px in a lighter grey), never
// two borders meeting (every section draws only its *top* edge, so nothing
// stacks into a 2–3px line), ONE font weight and family (enforced by
// `.invoice-clean` in globals.css) — only the company name and invoice
// number are bold (CLEAN_STRONG) — hierarchy otherwise by size alone: 20 · 14 · 12 · 11 ·
// 10.5 · 9px.
// ---------------------------------------------------------------------------

/** The single rule — every border on a CLEAN sheet is this same 1px line in
 * this one colour. Tables draw column rules only, never a line between rows. */
export const CLEAN_RULE = 'border-[#6b7280]';
/** Table header / grand-total row background. */
export const CLEAN_FILL = 'bg-[#f3f4f6]';
/** Secondary text. `clean-soft` (not a text-colour utility) so it survives
 * the force-black rule invoice sheets get in print — see globals.css. */
export const CLEAN_SOFT = 'clean-soft';
/** The bold text on a CLEAN sheet: the company name and invoice number. A class
 * (see globals.css), since `.invoice-clean` overrides every font-weight
 * utility. */
export const CLEAN_STRONG = 'clean-strong';
/** Section/field labels ("BILL TO", "INVOICE NO.") — the 9px size. */
export const CLEAN_LABEL = 'clean-soft block text-[9px] uppercase tracking-[0.07em]';

/** An amount without the currency symbol ("2,940.00") — the item table and
 * totals rows print bare numbers; only the grand total carries the ₹. Uses
 * fmtInr so grouping (lakh/crore vs thousands) follows the company currency. */
export function plainAmount(n: number, currency?: string): string {
  return fmtInr(n, currency).replace(/[^\d.,-]/g, '');
}

/** A stored multi-line address as one wrapping line, with the PIN code
 * appended when the address doesn't already include it. */
export function addressLine(address: string | null | undefined, pincode?: string | null): string {
  const flat = (address ?? '')
    .split(/\s*\n+\s*/)
    .map((s) => s.trim().replace(/,$/, ''))
    .filter(Boolean)
    .join(', ');
  const pin = pincode?.trim();
  if (!pin || flat.replace(/\s/g, '').includes(pin.replace(/\s/g, ''))) return flat;
  return flat ? `${flat} – ${pin}` : pin;
}

export type CleanHeaderProps = {
  company: {
    name: string;
    address?: string | null;
    pincode?: string | null;
    gstin?: string | null;
    state: string;
    fssaiNo?: string | null;
    phone?: string | null;
    altPhone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  /** Document title in the top row. */
  title?: string;
  /** Small right-aligned note in the title row — none unless given. */
  copyLabel?: string;
  invoiceNumber?: string;
  date: string;
  due?: string | null;
  /** The buyer's state — printed as Place of supply. */
  placeOfSupply?: string | null;
  /** Overrides the default Invoice No. / date / due / place-of-supply cells
   * (e.g. a credit note's own reference fields). */
  meta?: { label: string; value: string; strong?: boolean }[];
  /** Payment UPI QR, top-right, the same 88px as the logo. */
  upiQrDataUrl?: string | null;
  /** The company's GPay number — printed right under the UPI QR (or alone
   * in that slot when there's no QR), so both ways to pay sit together. */
  gpayNumber?: string | null;
  irn?: string | null;
  ackNo?: string | null;
  ackDate?: string | null;
  /** NIC-signed e-Invoice QR, shown with the IRN. */
  qrImageDataUrl?: string | null;
};

/** Title row, centered letterhead (logo · company · UPI QR, logo and QR the
 * same 88px, no frame of their own; the company block takes the middle half
 * of the width, its lines centered), the invoice details strip and, once
 * an e-Invoice is filed, its IRN/Ack/QR row. Rendered fresh at the top of
 * every printed page, like CLASSIC's header (see the pagination note in
 * invoice-sheet-classic.tsx). */
export function CleanHeader({
  company,
  title = 'Tax Invoice',
  copyLabel,
  invoiceNumber,
  date,
  due,
  placeOfSupply,
  meta,
  upiQrDataUrl,
  gpayNumber,
  irn,
  ackNo,
  ackDate,
  qrImageDataUrl,
}: CleanHeaderProps) {
  const contact = [company.phone, company.altPhone].filter(Boolean).join(', ');
  // The address flows as one run (not the lines it was typed in) balanced
  // over two lines; then one detail per line — a single "GSTIN · FSSAI" run
  // was wider than the address and stuck out of the block. No State line:
  // Place of supply sits right below, and the GSTIN starts with its code.
  const address = addressLine(company.address, company.pincode);
  const detailLines = [
    company.gstin && `GSTIN: ${company.gstin}`,
    company.fssaiNo && `FSSAI: ${company.fssaiNo}`,
    contact && `Contact: ${contact}`,
    company.email && `Email: ${company.email}`,
  ].filter((l): l is string => !!l);
  const cells: { label: string; value: string; strong?: boolean }[] = meta ?? [
    // No number exists yet for a brand-new, unsaved invoice — it's claimed
    // from the sequence on save — hence the dash rather than "Draft".
    { label: 'Invoice No.', value: invoiceNumber ?? '—', strong: true },
    { label: 'Invoice date', value: formatInvoiceDate(date) },
    ...(due ? [{ label: 'Due date', value: formatInvoiceDate(due) }] : []),
    { label: 'Place of supply', value: placeOfSupply ? `${placeOfSupply} (${gstStateCode(placeOfSupply)})` : '—' },
  ];

  return (
    <div className="flex-none">
      <div className="relative py-[7px] text-center text-[14px] uppercase tracking-[0.22em]">
        {title}
        {copyLabel && <span className={`${CLEAN_SOFT} absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] tracking-[0.08em]`}>{copyLabel}</span>}
      </div>

      {/* Equal side columns keep the company block exactly centered; the
          logo hugs the left edge, the QR the right. */}
      <div className={`grid grid-cols-[minmax(0,1fr)_50%_minmax(0,1fr)] items-center gap-[18px] border-t ${CLEAN_RULE} px-4 py-3.5`}>
        {company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt=""
            className="block h-[88px] w-[88px] justify-self-start object-contain"
            // visibility, not display — keeps the row's height either way.
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : (
          <span aria-hidden="true" className="block h-[88px] w-[88px]" />
        )}

        <div className="grid min-w-0 gap-0.5 text-center">
          <div className={`${CLEAN_STRONG} mb-[3px] text-[20px] leading-tight tracking-[0.01em]`}>{company.name}</div>
          <div className="break-words">
            {address && <div className="text-balance">{address}</div>}
            {detailLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>

        {upiQrDataUrl || gpayNumber ? (
          <div className="grid justify-items-center gap-[3px] justify-self-end">
            {upiQrDataUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={upiQrDataUrl} alt="Scan to pay via UPI" className="block h-[88px] w-[88px]" />
                <span className={`${CLEAN_SOFT} whitespace-nowrap text-[9px] uppercase tracking-[0.06em]`}>Scan to pay · UPI</span>
              </>
            )}
            {gpayNumber && <span className="whitespace-nowrap text-[10.5px]">GPay: {gpayNumber}</span>}
          </div>
        ) : (
          <span aria-hidden="true" className="block h-[88px] w-[88px]" />
        )}
      </div>

      <div className={`grid border-t ${CLEAN_RULE}`} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map((c, i) => (
          <div key={c.label} className={`grid gap-px px-2.5 py-1.5 ${i > 0 ? `border-l ${CLEAN_RULE}` : ''}`}>
            <span className={CLEAN_LABEL}>{c.label}</span>
            <span className={`text-[11px] ${c.strong ? CLEAN_STRONG : ''}`}>{c.value}</span>
          </div>
        ))}
      </div>

      {irn && (
        <div className={`grid items-center gap-4 border-t ${CLEAN_RULE} px-2.5 py-2 ${qrImageDataUrl ? 'grid-cols-[minmax(0,1fr)_88px]' : ''}`}>
          <div className="grid min-w-0 gap-px">
            <span className={CLEAN_LABEL}>e-Invoice</span>
            <span className="break-all">IRN: {irn}</span>
            {(ackNo || ackDate) && <span>{[ackNo && `Ack No: ${ackNo}`, ackDate && `Ack date: ${formatInvoiceDate(ackDate)}`].filter(Boolean).join(' · ')}</span>}
          </div>
          {qrImageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImageDataUrl} alt="e-Invoice QR" className="block h-[88px] w-[88px]" />
          )}
        </div>
      )}
    </div>
  );
}
