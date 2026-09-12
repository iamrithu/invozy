import { Minus, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { computeTotals, fmtInr } from '@/lib/gst';
import { numberToWords } from '@/lib/number-to-words';

export type InvoiceSheetCompany = {
  name: string;
  address?: string | null;
  gstin?: string | null;
  state: string;
  bankName?: string | null;
  bankAcc?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  upi?: string | null;
  terms?: string | null;
  logoUrl?: string | null;
  cgstRate: string | number;
  sgstRate: string | number;
  igstRate: string | number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
};

export type InvoiceSheetCustomer = {
  name: string;
  address?: string | null;
  state: string;
  gstin?: string | null;
};

export type InvoiceSheetLine = {
  lineId: string;
  productId?: string | null;
  name: string;
  hsn: string;
  unit: string;
  qty: number;
  rate: number;
  discount: number;
  packQty?: number | null;
};

/** Shared by the invoice builder's live preview and the saved-invoice view
 * (src/app/(app)/invoices/[id]/page.tsx) so the two can never drift — one
 * document, rendered editable or read-only. */
export function InvoiceSheet({
  company,
  customer,
  date,
  due,
  invoiceNumber,
  lines,
  totals,
  totalSavings,
  discountType,
  discountValue,
  editable,
  onDiscountTypeChange,
  onDiscountValueChange,
  onIncrement,
  onDecrement,
  onUpdateLine,
  onRemoveLine,
}: {
  company: InvoiceSheetCompany;
  customer: InvoiceSheetCustomer | null;
  date: string;
  due: string;
  invoiceNumber?: string;
  lines: InvoiceSheetLine[];
  totals: ReturnType<typeof computeTotals>;
  totalSavings: number;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  editable: boolean;
  onDiscountTypeChange?: (t: 'PERCENT' | 'FLAT') => void;
  onDiscountValueChange?: (v: number) => void;
  onIncrement?: (lineId: string) => void;
  onDecrement?: (lineId: string) => void;
  onUpdateLine?: (lineId: string, patch: Partial<InvoiceSheetLine>) => void;
  onRemoveLine?: (lineId: string) => void;
}) {
  return (
    <div className="rounded-b-lg2 border border-t-0 border-line bg-white p-[26px] pt-[26px] text-ink-body shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div className="flex items-start gap-3">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded-sm2 border border-line object-cover" />
          )}
          <div>
            <div className="text-[17px] font-extrabold text-ink">{company.name}</div>
            {company.address && <div className="mt-1 max-w-[280px] whitespace-pre-line text-[11.5px] leading-relaxed text-ink-soft">{company.address}</div>}
            <div className="mt-1.5 font-mono text-[10.5px] text-ink-soft">
              GSTIN {company.gstin || '—'} &nbsp;·&nbsp; {company.state}
            </div>
          </div>
        </div>
        <div className="rounded-lg2 border border-line bg-bg px-3.5 py-2.5 text-right">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-brand">Tax invoice</div>
          <div className="mt-1 font-mono text-[15px] font-extrabold text-ink">{invoiceNumber ?? 'Draft'}</div>
          <div className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
            Date <span className="font-mono text-ink-body">{date}</span>
            <br />
            Due <span className="font-mono text-ink-body">{due}</span>
          </div>
        </div>
      </div>

      <div className="border-b border-line py-3.5">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Bill to</div>
        {customer ? (
          <>
            <div className="text-[13px] font-bold text-ink">{customer.name}</div>
            <div className="mt-0.5 whitespace-pre-line text-[11.5px] leading-relaxed text-ink-soft">
              {customer.address ? `${customer.address}\n` : ''}
              {customer.state}
              {customer.gstin ? ` · GSTIN ${customer.gstin}` : ''}
            </div>
          </>
        ) : (
          <div className="text-[12px] italic text-ink-faint">Select a customer to fill this in</div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="mt-4 w-full text-[12px]">
          <thead>
            <tr className="border-b-2 border-ink text-left text-[10px] font-bold uppercase tracking-wide text-ink-faint">
              <th className="pb-1.5 pr-1.5">Item</th>
              <th className="pb-1.5 pr-1.5 font-mono">HSN</th>
              <th className="pb-1.5 pr-1.5 text-right">Qty</th>
              <th className="pb-1.5 pr-1.5 text-right font-mono">Rate</th>
              {editable && <th className="pb-1.5 pr-1.5 text-right">Disc%</th>}
              <th className="pb-1.5 pr-1.5 text-right font-mono">Amount</th>
              {editable && <th className="pb-1.5" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={editable ? 7 : 5} className="py-6 text-center text-ink-faint">
                  No line items yet — add products from the left.
                </td>
              </tr>
            ) : (
              lines.map((l) => {
                const lineTaxable = l.qty * l.rate * (1 - l.discount / 100);
                const pieceHint = l.packQty && Number(l.packQty) > 0 ? `≈${Number(l.packQty) * l.qty} pcs` : null;
                return (
                  <tr key={l.lineId} className="border-b border-line even:bg-bg">
                    <td className="whitespace-nowrap py-2 pr-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        {l.name}
                        {!l.productId && (
                          <span title="Not from your product catalog" className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-faint">
                            Custom
                          </span>
                        )}
                        {!l.hsn && <AlertTriangle size={11} className="flex-shrink-0 text-gold" aria-label="No HSN code" />}
                      </span>
                      {editable && !l.discount && pieceHint && <div className="text-[10.5px] font-medium text-ink-faint">{pieceHint}</div>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-1.5 font-mono">{l.hsn || '—'}</td>
                    <td className="whitespace-nowrap py-2 pr-1.5 text-right">
                      {editable ? (
                        <div className="inline-flex items-center gap-1 rounded-full bg-bg p-0.5">
                          <button onClick={() => onDecrement?.(l.lineId)} aria-label={`Decrease ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line bg-surface text-ink-soft hover:border-brand hover:text-brand">
                            <Minus size={9} />
                          </button>
                          <span key={l.qty} className="min-w-[14px] animate-bump text-center font-mono text-[11.5px] font-bold">
                            {l.qty}
                          </span>
                          <button onClick={() => onIncrement?.(l.lineId)} aria-label={`Increase ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line bg-surface text-ink-soft hover:border-brand hover:text-brand">
                            <Plus size={9} />
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono">
                          {l.qty} {l.unit}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-1.5 text-right">
                      {editable ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.rate}
                          onChange={(e) => onUpdateLine?.(l.lineId, { rate: parseFloat(e.target.value) || 0 })}
                          className="w-[56px] rounded-sm2 border border-line bg-surface px-1.5 py-1 text-right font-mono text-[11.5px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
                        />
                      ) : (
                        <span className="font-mono">{fmtInr(l.rate)}</span>
                      )}
                    </td>
                    {editable && (
                      <td className="whitespace-nowrap py-2 pr-1.5 text-right">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="1"
                          value={l.discount}
                          onChange={(e) => onUpdateLine?.(l.lineId, { discount: parseFloat(e.target.value) || 0 })}
                          className="w-[42px] rounded-sm2 border border-line bg-surface px-1.5 py-1 text-right font-mono text-[11.5px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap py-2 pr-1.5 text-right font-mono">{fmtInr(lineTaxable)}</td>
                    {editable && (
                      <td className="whitespace-nowrap py-2">
                        <button onClick={() => onRemoveLine?.(l.lineId)} aria-label={`Remove ${l.name}`} className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-ink-faint hover:bg-brand-light hover:text-brand-dark">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editable && lines.length > 0 && (
        <div className="mt-0.5 flex items-center gap-2.5 border-t border-dashed border-line px-1.5 py-2.5 text-[12px] font-bold text-ink-soft">
          <span>Overall discount</span>
          <div className="flex rounded-full bg-bg p-0.5">
            <button onClick={() => onDiscountTypeChange?.('PERCENT')} aria-label="Percent discount" className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${discountType === 'PERCENT' ? 'bg-brand text-white' : 'text-ink-faint'}`}>
              %
            </button>
            <button onClick={() => onDiscountTypeChange?.('FLAT')} aria-label="Flat rupee discount" className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${discountType === 'FLAT' ? 'bg-brand text-white' : 'text-ink-faint'}`}>
              ₹
            </button>
          </div>
          <input
            type="number"
            min={0}
            step="0.5"
            value={discountValue}
            onChange={(e) => onDiscountValueChange?.(parseFloat(e.target.value) || 0)}
            className="ml-auto w-20 rounded-sm2 border border-line bg-surface px-2 py-1 text-right font-mono text-[12.5px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
          />
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <div className="w-full max-w-[280px] rounded-md2 border border-line bg-bg p-3 text-[12px]">
          <TotalsRow k="Subtotal" v={fmtInr(totals.subtotal)} />
          {totals.overallDiscountAmount > 0 && <TotalsRow k={`Discount${discountType === 'PERCENT' ? ` (${discountValue}%)` : ''}`} v={`−${fmtInr(totals.overallDiscountAmount)}`} negative />}
          <TotalsRow k="Taxable value" v={fmtInr(totals.taxable)} />
          {totals.useIgst ? (
            <TotalsRow k={`IGST @ ${company.igstRate}%`} v={fmtInr(totals.igst)} />
          ) : (
            <>
              {company.cgstEnabled && <TotalsRow k={`CGST @ ${company.cgstRate}%`} v={fmtInr(totals.cgst)} />}
              {company.sgstEnabled && <TotalsRow k={`SGST @ ${company.sgstRate}%`} v={fmtInr(totals.sgst)} />}
            </>
          )}
          <TotalsRow k="Round off" v={`${totals.roundOff >= 0 ? '+' : ''}${fmtInr(totals.roundOff)}`} />
          <div className="mt-1.5 flex justify-between border-t-2 border-ink pt-2 text-[14px] font-extrabold text-brand-dark">
            <span>Total due</span>
            <span key={totals.total} className="animate-total-pulse font-mono">
              {fmtInr(totals.total)}
            </span>
          </div>
          {totalSavings > 0 && <TotalsRow k="You saved" v={fmtInr(totalSavings)} good />}
        </div>
      </div>

      {totals.total > 0 && (
        <div className="mt-3 rounded-md2 bg-brand-light px-3.5 py-2.5 text-[11.5px] text-brand-dark">
          Amount in words: <b className="text-ink">Rupees {numberToWords(totals.total)} Only</b>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-5 border-t border-line pt-3.5">
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Bank details</div>
          <div className="font-mono text-[11px] leading-relaxed text-ink-soft">
            {company.bankName}
            <br />
            A/C {company.bankAcc}
            <br />
            IFSC {company.ifsc}
            <br />
            {company.branch}
            {company.upi ? (
              <>
                <br />
                UPI {company.upi}
              </>
            ) : null}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Terms</div>
          <p className="max-w-[210px] text-[10.5px] leading-relaxed text-ink-faint">{company.terms}</p>
        </div>
        <div className="text-right">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">For {company.name}</div>
          <div className="ml-auto mt-[30px] w-[140px] border-t border-line pt-1.5 text-[10.5px] text-ink-faint">Authorised signatory</div>
        </div>
      </div>
    </div>
  );
}

function TotalsRow({ k, v, negative, good }: { k: string; v: string; negative?: boolean; good?: boolean }) {
  return (
    <div className={`flex justify-between px-1.5 py-1 ${negative ? 'text-brand-dark' : good ? 'font-bold text-green' : 'text-ink-soft'}`}>
      <span>{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
