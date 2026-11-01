import { gstStateCode } from '@/lib/gst-state-codes';
import { cn } from '@/lib/utils';
import { rupeesInWords } from './format';

// Building blocks for printed documents in the owner's "Clean" style — the
// same look as the Clean invoice template: a centered letterhead (88px logo
// slot, company block centered between two equal slots), every rule one
// 1px grey, ONE font weight (500) everywhere with hierarchy from size only
// (20 · 14 · 12 · 11 · 10.5 · 9px), labels in small caps-style uppercase.
//
// Laid out for the A4 content box (186mm wide — see src/lib/pdf-browser.ts
// PDF_PAGE) and used both by the /print/** pages the PDF renderer loads and
// by on-screen previews, so the screen shows exactly what prints. Plain
// presentational components: no hooks, no server imports.
//
// Colours are fixed paper colours, never theme tokens — a document is
// white paper in dark mode too. Kept as literal class strings so Tailwind's
// scanner picks them up.

/** The one rule colour. */
export const RULE = 'border-[#6b7280]';
/** Between item rows only — lighter so a long table doesn't read as a grid. */
const ROW_RULE = 'border-[#d1d5db]';
const SOFT = 'text-[#4b5563]';
const FILL = 'bg-[#f3f4f6]';

export type LetterheadCompany = {
  name: string;
  address: string | null;
  pincode: string | null;
  state: string;
  gstin: string | null;
  fssaiNo: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  logoUrl: string | null;
  signatoryName: string | null;
  signatureUrl: string | null;
};

export type BuyerInfo = {
  /** Shop name when set, else the person's name. */
  name: string;
  /** The person behind the shop (or the contact person). */
  subName: string | null;
  address: string | null;
  state: string;
  gstin: string | null;
  phone: string | null;
};

/** The paper itself: white page, single weight, one outer frame, and the
 * spaced-out document title ("CREDIT NOTE") across the top. The frame
 * clones its border onto every printed page it spans, so a page-two
 * continuation is still a closed box. */
export function CleanDoc({ title, copyLabel, children, className }: { title: string; copyLabel?: string; children: React.ReactNode; className?: string }) {
  return (
    // `invoice-clean` (globals.css) is the Clean invoice's own one-family,
    // one-weight rule — shared so both documents print identically.
    <div className={cn('invoice-clean bg-white font-sans text-[10.5px] font-medium leading-[1.45] text-[#1c1c1c] tabular-nums [&_*]:font-medium', className)}>
      <div className={cn('border [-webkit-box-decoration-break:clone] [box-decoration-break:clone]', RULE)}>
        <div className={cn('relative border-b py-[7px] text-center text-[14px] uppercase tracking-[0.22em]', RULE)}>
          {title}
          {copyLabel && <span className={cn('absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] tracking-[0.08em]', SOFT)}>{copyLabel}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Small uppercase field label ("INVOICE NO."). */
export function Lab({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('block text-[9px] uppercase tracking-[0.07em]', SOFT, className)}>{children}</span>;
}

/** A stored (possibly multi-line) address as one wrapping line, with the
 * PIN code appended when the address doesn't already include it — the same
 * rule as the Clean invoice's buyer block. */
export function addressLine(address: string | null | undefined, pincode?: string | null): string | null {
  const flat = (address ?? '')
    .split(/\s*\n+\s*/)
    .map((s) => s.trim().replace(/,$/, ''))
    .filter(Boolean)
    .join(', ');
  const pin = pincode?.trim();
  if (!pin || flat.replace(/\s/g, '').includes(pin.replace(/\s/g, ''))) return flat || null;
  return flat ? `${flat} – ${pin}` : pin;
}

/** The company address as the letterhead prints it: its own lines as
 * typed (not flattened like addressLine), with the PIN code added to the
 * last one when the address doesn't already include it — the same rule as
 * the Clean invoice's letterhead. */
export function letterheadAddressLines(address: string | null | undefined, pincode?: string | null): string[] {
  const lines = (address ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pin = pincode?.trim();
  if (!pin || lines.join('').replace(/\s/g, '').includes(pin.replace(/\s/g, ''))) return lines;
  if (!lines.length) return [pin];
  lines[lines.length - 1] = `${lines[lines.length - 1].replace(/,$/, '')} – ${pin}`;
  return lines;
}

/** Logo left (88 × 88, no border), company block centered, an equal 88px
 * slot on the right (`right`, e.g. a QR) so the block stays centered
 * whether or not either slot is filled. */
export function Letterhead({ company, right }: { company: LetterheadCompany; right?: React.ReactNode }) {
  const phones = [company.phone, company.altPhone].filter(Boolean).join(', ');
  // Same block as the Clean invoice's letterhead: address, then one detail
  // per line.
  const detailLines = [
    ...letterheadAddressLines(company.address, company.pincode),
    company.gstin && `GSTIN: ${company.gstin}`,
    `State: ${company.state} (${gstStateCode(company.state)})`,
    company.fssaiNo && `FSSAI: ${company.fssaiNo}`,
    phones && `Contact: ${phones}`,
    company.email && `Email: ${company.email}`,
  ].filter((l): l is string => !!l);
  return (
    <div className={cn('grid grid-cols-[88px_minmax(0,1fr)_88px] items-center gap-[18px] border-b px-4 py-3.5', RULE)}>
      <div className="h-[88px] w-[88px]">
        {company.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logoUrl} alt="" className="block h-[88px] w-[88px] object-contain" />
        )}
      </div>
      <div className="grid gap-0.5 text-center">
        <div className="clean-strong mb-[3px] text-[20px] leading-[1.2] tracking-[0.01em]">{company.name}</div>
        {/* Centered as a block, its lines left-aligned. */}
        <div className="justify-self-center text-left">
          {detailLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
      <div className="h-[88px] w-[88px]">{right}</div>
    </div>
  );
}

/** One row of label/value cells ("Credit note no · Date · Against invoice
 * · Invoice date"), equal widths, ruled between. */
export function MetaStrip({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className={cn('grid border-b', RULE)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div key={i} className={cn('grid gap-px px-2.5 py-1.5', i > 0 && 'border-l', RULE)}>
          <Lab>{it.label}</Lab>
          <span className="text-[11px]">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Two side-by-side boxes (buyer on the left, document details on the
 * right), ruled between. */
export function Parties({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className={cn('grid grid-cols-2 border-b [break-inside:avoid]', RULE)}>
      <div className="grid content-start gap-px px-2.5 py-2">{left}</div>
      <div className={cn('grid content-start gap-px border-l px-2.5 py-2', RULE)}>{right}</div>
    </div>
  );
}

/** The customer, as printed under "Bill to" / "Received from". */
export function BuyerBlock({ label, buyer }: { label: string; buyer: BuyerInfo }) {
  return (
    <>
      <Lab>{label}</Lab>
      <span className="mb-px mt-0.5 text-[12px]">{buyer.name}</span>
      {buyer.subName && <span>{buyer.subName}</span>}
      {buyer.address && <span>{buyer.address}</span>}
      <span>
        State: {buyer.state} ({gstStateCode(buyer.state)}) · {buyer.gstin ? `GSTIN: ${buyer.gstin}` : 'Unregistered'}
      </span>
      {buyer.phone && <span>Phone: {buyer.phone}</span>}
    </>
  );
}

/** A full-width bordered table that sits inside the frame (the frame
 * supplies the outer left/right edges, this the rule underneath). Its
 * header repeats on every printed page and rows never split across a
 * page break. */
export function DocTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border-b', RULE)}>
      {/* table-fixed: the <colgroup> widths hold, and a long product name
          wraps instead of squeezing the number columns. */}
      <table className={cn('w-full table-fixed border-collapse text-[10.5px]', className)}>{children}</table>
    </div>
  );
}

type Align = 'left' | 'right' | 'center';
const ALIGN: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function Th({ children, align = 'left', className }: { children?: React.ReactNode; align?: Align; className?: string }) {
  return (
    <th className={cn('border-b border-l px-1.5 py-1.5 align-bottom text-[9px] uppercase tracking-[0.06em] first:border-l-0', RULE, FILL, ALIGN[align], className)}>
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className, colSpan }: { children?: React.ReactNode; align?: Align; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('border-l px-1.5 py-1.5 align-top first:border-l-0', RULE, ALIGN[align], className)}>
      {children}
    </td>
  );
}

/** An item row — light rule underneath, never split across pages. */
export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn('border-b [break-inside:avoid] last:border-b-0', ROW_RULE, className)}>{children}</tr>;
}

/** A totals/summary row inside a DocTable (full rule above, light fill).
 * The rule sits on the cells, not the row: in a collapsed table the row
 * above's light bottom rule would otherwise win the shared edge. */
export function TotalTr({ children }: { children: React.ReactNode }) {
  return <tr className={cn('[break-inside:avoid] [&>td]:border-t', FILL)}>{children}</tr>;
}

export type TotalRow = { label: string; value: string; kind?: 'sep' | 'grand' | 'note' };

/** The right-hand totals column — label/amount pairs, a rule above the
 * taxable value (`sep`) and a filled, larger grand total (`grand`). */
export function TotalsTable({ rows }: { rows: TotalRow[] }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <tbody>
        {rows.map((r, i) =>
          r.kind === 'note' ? (
            <tr key={i}>
              <td colSpan={2} className={cn('px-2.5 pt-1.5 text-right text-[10px]', SOFT)}>
                {r.label}
              </td>
            </tr>
          ) : (
            <tr
              key={i}
              // The grand total's bottom rule only when something follows it —
              // as the last row it sits on the closing block's own rule.
              className={cn(r.kind === 'sep' && 'border-t', r.kind === 'grand' && cn('border-t text-[14px] [&:not(:last-child)]:border-b', FILL), RULE)}
            >
              <td className={cn('px-2.5', r.kind === 'grand' ? 'py-[7px]' : 'py-1')}>{r.label}</td>
              <td className={cn('px-2.5 text-right', r.kind === 'grand' ? 'py-[7px]' : 'py-1')}>{r.value}</td>
            </tr>
          )
        )}
      </tbody>
    </table>
  );
}

/** Closing block: notes on the left (amount in words etc.), totals on the
 * right. Kept on one page. */
export function Closing({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_270px] border-b [break-inside:avoid]', RULE)}>
      <div className={cn('grid content-start gap-2 border-r px-2.5 py-2', RULE)}>{left}</div>
      <div>{right}</div>
    </div>
  );
}

export function AmountInWords({ amount, label = 'Amount in words' }: { amount: number; label?: string }) {
  return (
    <div>
      <Lab>{label}</Lab>
      <div>{rupeesInWords(amount)}</div>
    </div>
  );
}

/** Receiver's signature (left — or any `left` content, e.g. a thank-you
 * line on a receipt) and "For <company> · Authorised signatory" (right,
 * with the saved signature image when the company has one). */
export function SignatureRow({ company, left }: { company: LetterheadCompany; left?: React.ReactNode }) {
  return (
    <div className="grid min-h-[78px] grid-cols-2 [break-inside:avoid]">
      <div className="flex flex-col justify-between px-2.5 py-2">
        {left ?? (
          <>
            <Lab>Receiver&apos;s signature</Lab>
            <span className={SOFT}>Name &amp; date</span>
          </>
        )}
      </div>
      <div className={cn('flex flex-col items-end justify-between border-l px-2.5 py-2 text-right', RULE)}>
        <span>For {company.name}</span>
        {company.signatureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.signatureUrl} alt="" className="my-1 h-9 max-w-[160px] object-contain" />
        )}
        <span className="grid justify-items-end">
          {company.signatoryName && <span>{company.signatoryName}</span>}
          <Lab>Authorised signatory</Lab>
        </span>
      </div>
    </div>
  );
}
