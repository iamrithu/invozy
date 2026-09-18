import { Minus, Plus, Trash2 } from 'lucide-react';
import { computeTotals, computeHsnSummary, fmtInr, formatInvoiceDate, DEFAULT_HSN } from '@/lib/gst';
import { numberToWords, amountToWordsWithPaise } from '@/lib/number-to-words';
import { gstStateCode } from '@/lib/gst-state-codes';

export type ClassicCompany = {
  name: string;
  address?: string | null;
  gstin?: string | null;
  pan?: string | null;
  logoUrl?: string | null;
  state: string;
  fssaiNo?: string | null;
  pincode?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  bankName?: string | null;
  bankAcc?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  upi?: string | null;
  terms?: string | null;
  cgstRate: string | number;
  sgstRate: string | number;
  igstRate: string | number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
  signatoryName?: string | null;
  signatureUrl?: string | null;
};

export type ClassicCustomer = {
  name: string;
  shopName?: string | null;
  address?: string | null;
  state: string;
  gstin?: string | null;
  fssaiNo?: string | null;
  pincode?: string | null;
  contact?: string | null;
  phone?: string | null;
  altPhone?: string | null;
};

export type ClassicLine = {
  lineId: string;
  productId?: string | null;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  discount: number;
  hsn?: string | null;
  batch?: string | null;
  altUnit?: string | null;
  altQtyPerUnit?: number | null;
};

export type ClassicEway = {
  ewbNo?: string | null;
  ewbDate?: string | null;
  vehicleNo?: string | null;
  transportMode?: string | null;
  transporterName?: string | null;
  distanceKm?: number | null;
};

/** The CLASSIC (Tally/ERP-style) GST tax invoice — a distinct layout from
 * InvoiceSheet, selected per-Company via Company.invoiceTemplate. Mirrors a
 * real dairy-distributor tax invoice: IRN/QR + Ack block, buyer FSSAI/
 * contact, HSN/SAC item table (with per-line and overall discount, and an
 * optional secondary-quantity column), HSN-wise tax summary with its own
 * "Tax Amount (in words)" line, Bank Details/Terms (from Company settings),
 * declaration, and a Customer's Sign / Authorised Signatory row. See
 * invoice-eway-bill-sheet.tsx for the companion printed e-Way Bill page. */
export function InvoiceSheetClassic({
  company,
  customer,
  date,
  invoiceNumber,
  lines,
  totals,
  discountType,
  discountValue,
  irn,
  ackNo,
  ackDate,
  qrImageDataUrl,
  eway,
  editable,
  onUpdateLine,
  onIncrement,
  onDecrement,
  onRemoveLine,
  onDiscountTypeChange,
  onDiscountValueChange,
}: {
  company: ClassicCompany;
  customer: ClassicCustomer | null;
  date: string;
  invoiceNumber?: string;
  lines: ClassicLine[];
  totals: ReturnType<typeof computeTotals>;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  irn?: string | null;
  ackNo?: string | null;
  ackDate?: string | null;
  qrImageDataUrl?: string | null;
  eway?: ClassicEway | null;
  editable: boolean;
  onUpdateLine?: (lineId: string, patch: Partial<ClassicLine>) => void;
  onIncrement?: (lineId: string) => void;
  onDecrement?: (lineId: string) => void;
  onRemoveLine?: (lineId: string) => void;
  onDiscountTypeChange?: (t: 'PERCENT' | 'FLAT') => void;
  onDiscountValueChange?: (v: number) => void;
}) {
  const hsnRows = customer
    ? computeHsnSummary(
        lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount, hsn: l.hsn })),
        { type: discountType, value: discountValue },
        {
          cgstRate: Number(company.cgstRate),
          sgstRate: Number(company.sgstRate),
          igstRate: Number(company.igstRate),
          cgstEnabled: company.cgstEnabled,
          sgstEnabled: company.sgstEnabled,
          igstEnabled: company.igstEnabled,
        },
        company.state,
        customer.state
      )
    : [];
  const hsnTotal = hsnRows.reduce(
    (acc, r) => ({
      taxableValue: acc.taxableValue + r.taxableValue,
      cgstAmount: acc.cgstAmount + r.cgstAmount,
      sgstAmount: acc.sgstAmount + r.sgstAmount,
      igstAmount: acc.igstAmount + r.igstAmount,
      totalTax: acc.totalTax + r.totalTax,
    }),
    { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0 }
  );
  const hasAltQty = lines.some((l) => l.altUnit && l.altQtyPerUnit);
  const altUnitLabel = lines.find((l) => l.altUnit)?.altUnit ?? '';
  const footTdColSpan = (editable ? 7 : 6) + (hasAltQty ? 1 : 0);

  return (
    <div className="rounded-b-lg2 border border-t-0 border-line bg-white p-5 text-[11.5px] leading-normal text-ink-body shadow-card print:rounded-none print:border-none print:p-0 print:shadow-none">
      <div className="border border-ink">
        <div className="border-b border-ink bg-surface-alt py-1.5 text-center text-[13.5px] font-extrabold uppercase tracking-wide text-ink">Tax Invoice</div>

        <div className="flex flex-wrap justify-between gap-3 border-b border-ink p-2">
          <div className="flex max-w-[380px] items-start gap-2.5">
            {company.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt="" className="h-11 w-11 flex-shrink-0 rounded-sm2 border border-line object-contain" />
            )}
            <div>
              <div className="text-[15px] font-extrabold tracking-tight text-ink">{company.name}</div>
              {company.address && <div className="whitespace-pre-line leading-snug">{company.address}</div>}
              <div className="mt-1 font-mono font-tabular">GSTIN/UIN: {company.gstin || '—'}</div>
              <div>
                State Name : {company.state}, Code : <span className="font-mono font-tabular">{gstStateCode(company.state)}</span>
              </div>
              {company.fssaiNo && <div>FSSAI License Number : {company.fssaiNo}</div>}
              {company.phone && (
                <div className="font-mono font-tabular">
                  Mobile : {company.phone}
                  {company.altPhone ? `, ${company.altPhone}` : ''}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            {irn ? (
              <>
                {qrImageDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrImageDataUrl} alt="e-Invoice QR" className="ml-auto h-[110px] w-[110px]" />
                )}
                <div className="mt-1 font-bold uppercase tracking-wide text-ink-faint">e-Invoice</div>
                <div className="max-w-[220px] break-all font-mono text-[10px]">IRN : {irn}</div>
                {ackNo && <div className="font-tabular">Ack No. : {ackNo}</div>}
                {ackDate && <div className="font-tabular">Ack Date : {formatInvoiceDate(ackDate)}</div>}
              </>
            ) : (
              <div className="rounded-sm2 border border-dashed border-line px-3 py-2 text-[10.5px] text-ink-faint print:hidden">e-Invoice not generated yet</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap border-b border-ink">
          <div className="min-w-[260px] flex-1 border-r border-ink p-2">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Buyer (Bill to)</div>
            {customer ? (
              <>
                <div className="text-[13px] font-bold text-ink">{customer.name}</div>
                {customer.shopName && <div className="font-semibold text-ink-body">{customer.shopName}</div>}
                {customer.address && <div className="whitespace-pre-line leading-snug">{customer.address}</div>}
                <div className="mt-1 font-mono font-tabular">GSTIN/UIN : {customer.gstin || '—'}</div>
                <div>
                  State Name : {customer.state}, Code : <span className="font-mono font-tabular">{gstStateCode(customer.state)}</span>
                </div>
                {customer.fssaiNo && <div>FSSAI No. : {customer.fssaiNo}</div>}
                {customer.contact && <div>Contact person : {customer.contact}</div>}
                {customer.phone && (
                  <div className="font-mono font-tabular">
                    Mobile : {customer.phone}
                    {customer.altPhone ? `, ${customer.altPhone}` : ''}
                  </div>
                )}
              </>
            ) : (
              <div className="italic text-ink-faint">Select a customer to fill this in</div>
            )}
          </div>
          <div className="min-w-[220px] flex-1 p-2">
            <div className="grid grid-cols-2 gap-x-3">
              <Row k="Invoice No." v={invoiceNumber ?? 'Draft'} mono />
              <Row k="Dated" v={formatInvoiceDate(date)} mono />
              {eway?.ewbNo && <Row k="e-Way Bill No." v={eway.ewbNo} mono />}
              {eway?.vehicleNo && <Row k="Vehicle No." v={eway.vehicleNo} mono />}
            </div>
          </div>
        </div>

        {/* min-width stops the browser's table auto-layout from
            proportionally shrinking every column (and wrapping header text
            into an unreadable stack) on a narrow mobile viewport — it only
            engages below that width, since w-full already fills anything
            wider. overflow-x-auto lets it scroll horizontally there instead,
            same as a real PDF viewer. print:min-w-0/overflow-visible reverts
            both for the actual print/PDF output, which is never this narrow. */}
        <div className="overflow-x-auto print:overflow-visible">
        <table className={`w-full border-collapse text-[11px] print:min-w-0 ${editable ? 'min-w-[720px]' : 'min-w-[640px]'}`}>
          <thead>
            <tr className="border-b border-ink bg-surface-alt text-left font-bold">
              <th className="w-9 border-r border-ink px-2.5 py-1.5">Sl</th>
              <th className="border-r border-ink px-2.5 py-1.5">Description of Goods</th>
              <th className="w-[78px] border-r border-ink px-2.5 py-1.5">HSN/SAC</th>
              <th className="w-[92px] border-r border-ink px-2.5 py-1.5 text-right">Quantity</th>
              <th className="w-[76px] border-r border-ink px-2.5 py-1.5 text-right">Rate</th>
              <th className="w-11 border-r border-ink px-2.5 py-1.5 text-right">per</th>
              {editable && <th className="w-14 border-r border-ink px-2.5 py-1.5 text-right">Disc%</th>}
              {hasAltQty && <th className="w-16 border-r border-ink px-2.5 py-1.5 text-right">In {altUnitLabel}</th>}
              <th className="w-[100px] px-2.5 py-1.5 text-right">Amount</th>
              {editable && <th className="w-6 px-1" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={7 + (hasAltQty ? 1 : 0) + (editable ? 2 : 0)} className="py-6 text-center text-ink-faint">
                  No line items yet.
                </td>
              </tr>
            ) : (
              lines.map((l, i) => {
                const amount = l.qty * l.rate * (1 - l.discount / 100);
                const altQty = l.altUnit && l.altQtyPerUnit ? l.qty * l.altQtyPerUnit : null;
                return (
                  <tr key={l.lineId} className="border-b border-line">
                    <td className="border-r border-ink px-2.5 py-1.5 align-top font-tabular">{i + 1}</td>
                    <td className="border-r border-ink px-2.5 py-1.5 align-top">{l.name}</td>
                    <td className="border-r border-ink px-2.5 py-1.5 align-top font-mono">
                      {editable ? (
                        <input
                          value={l.hsn ?? ''}
                          onChange={(e) => onUpdateLine?.(l.lineId, { hsn: e.target.value })}
                          placeholder={DEFAULT_HSN}
                          className="w-16 rounded-sm2 border border-line bg-surface px-1 py-0.5 text-[10.5px] focus:border-brand focus:outline-none"
                        />
                      ) : (
                        l.hsn || DEFAULT_HSN
                      )}
                    </td>
                    <td className="border-r border-ink px-2.5 py-1.5 text-right align-top">
                      {editable ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => onDecrement?.(l.lineId)} aria-label={`Decrease ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line">
                            <Minus size={9} />
                          </button>
                          <span className="min-w-[24px] text-center font-mono font-tabular">
                            {l.qty} {l.unit}
                          </span>
                          <button onClick={() => onIncrement?.(l.lineId)} aria-label={`Increase ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line">
                            <Plus size={9} />
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono font-tabular">
                          {l.qty} {l.unit}
                        </span>
                      )}
                    </td>
                    <td className="border-r border-ink px-2.5 py-1.5 text-right align-top font-mono font-tabular">{fmtInr(l.rate)}</td>
                    <td className="border-r border-ink px-2.5 py-1.5 text-right align-top">{l.unit}</td>
                    {editable && (
                      <td className="border-r border-ink px-2.5 py-1.5 text-right align-top">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="1"
                          value={l.discount}
                          onChange={(e) => onUpdateLine?.(l.lineId, { discount: parseFloat(e.target.value) || 0 })}
                          className="w-12 rounded-sm2 border border-line bg-surface px-1 py-0.5 text-right font-mono text-[10.5px] focus:border-brand focus:outline-none"
                        />
                      </td>
                    )}
                    {hasAltQty && (
                      <td className="border-r border-ink px-2.5 py-1.5 text-right align-top font-mono font-tabular">{altQty !== null ? altQty.toFixed(2).replace(/\.00$/, '') : ''}</td>
                    )}
                    <td className="px-2.5 py-1.5 text-right align-top font-mono font-tabular">{fmtInr(amount)}</td>
                    {editable && (
                      <td className="px-1 py-1.5 align-top">
                        <button onClick={() => onRemoveLine?.(l.lineId)} aria-label={`Remove ${l.name}`} className="flex h-[20px] w-[20px] items-center justify-center rounded-full text-ink-faint hover:text-destructive">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            {totals.overallDiscountAmount > 0 && (
              <tr>
                <td colSpan={footTdColSpan} className="border-t border-ink px-2.5 py-1 text-right font-bold">
                  Discount
                </td>
                <td className="border-t border-ink px-2.5 py-1 text-right font-mono font-tabular">−{fmtInr(totals.overallDiscountAmount)}</td>
                {editable && <td className="border-t border-ink" />}
              </tr>
            )}
            <tr>
              <td colSpan={footTdColSpan} className={`px-2.5 py-1 text-right font-bold ${totals.overallDiscountAmount > 0 ? '' : 'border-t border-ink'}`}>
                {totals.useIgst ? (
                  'Outward IGST'
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span>Outward CGST</span>
                    <span>Outward SGST</span>
                  </div>
                )}
              </td>
              <td className={`px-2.5 py-1 text-right font-mono font-tabular ${totals.overallDiscountAmount > 0 ? '' : 'border-t border-ink'}`}>
                {totals.useIgst ? (
                  fmtInr(totals.igst)
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span>{fmtInr(totals.cgst)}</span>
                    <span>{fmtInr(totals.sgst)}</span>
                  </div>
                )}
              </td>
              {editable && <td className={totals.overallDiscountAmount > 0 ? '' : 'border-t border-ink'} />}
            </tr>
            <tr>
              <td colSpan={footTdColSpan} className="px-2.5 py-1 text-right font-bold">
                Rounding Off
              </td>
              <td className="px-2.5 py-1 text-right font-mono font-tabular">{`${totals.roundOff >= 0 ? '+' : ''}${fmtInr(totals.roundOff)}`}</td>
              {editable && <td />}
            </tr>
            <tr className="border-t-2 border-ink bg-surface-alt">
              <td colSpan={footTdColSpan} className="px-2.5 py-1.5 text-right text-[13px] font-extrabold">
                Total
              </td>
              <td className="px-2.5 py-1.5 text-right font-mono font-tabular text-[13px] font-extrabold">{fmtInr(totals.total)}</td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
        </div>

        {editable && (
          <div className="flex items-center gap-2.5 border-t border-dashed border-line px-2.5 py-2 text-[12px] font-bold text-ink-soft print:hidden">
            <span>Overall discount</span>
            <div className="flex rounded-full bg-bg p-0.5">
              <button
                type="button"
                onClick={() => onDiscountTypeChange?.('PERCENT')}
                aria-label="Percent discount"
                className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${discountType === 'PERCENT' ? 'bg-brand text-white' : 'text-ink-faint'}`}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => onDiscountTypeChange?.('FLAT')}
                aria-label="Flat rupee discount"
                className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${discountType === 'FLAT' ? 'bg-brand text-white' : 'text-ink-faint'}`}
              >
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

        <div className="border-t border-ink p-2.5 break-inside-avoid">
          <span className="font-bold">Amount Chargeable (in words) : </span>
          INR {numberToWords(totals.total)} Only
        </div>

        {hsnRows.length > 0 && (
          <>
            <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[560px] border-collapse border-t border-ink text-[10.5px] print:min-w-0">
              <thead>
                <tr className="border-b border-ink bg-surface-alt text-left font-bold">
                  <th className="border-r border-ink px-2.5 py-1">HSN/SAC</th>
                  <th className="border-r border-ink px-2.5 py-1 text-right">Taxable Value</th>
                  {totals.useIgst ? (
                    <>
                      <th className="border-r border-ink px-2.5 py-1 text-right">IGST Rate</th>
                      <th className="border-r border-ink px-2.5 py-1 text-right">IGST Amount</th>
                    </>
                  ) : (
                    <>
                      <th className="border-r border-ink px-2.5 py-1 text-right">CGST Rate</th>
                      <th className="border-r border-ink px-2.5 py-1 text-right">CGST Amt</th>
                      <th className="border-r border-ink px-2.5 py-1 text-right">SGST Rate</th>
                      <th className="border-r border-ink px-2.5 py-1 text-right">SGST Amt</th>
                    </>
                  )}
                  <th className="px-2.5 py-1 text-right">Total Tax Amount</th>
                </tr>
              </thead>
              <tbody>
                {hsnRows.map((r) => (
                  <tr key={r.hsn} className="border-b border-line">
                    <td className="border-r border-ink px-2.5 py-1 font-mono">{r.hsn}</td>
                    <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.taxableValue)}</td>
                    {totals.useIgst ? (
                      <>
                        <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{r.igstRate}%</td>
                        <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.igstAmount)}</td>
                      </>
                    ) : (
                      <>
                        <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{r.cgstRate}%</td>
                        <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.cgstAmount)}</td>
                        <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{r.sgstRate}%</td>
                        <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.sgstAmount)}</td>
                      </>
                    )}
                    <td className="px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.totalTax)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-alt font-bold">
                  <td className="border-r border-ink px-2.5 py-1">Total</td>
                  <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.taxableValue)}</td>
                  {totals.useIgst ? (
                    <>
                      <td className="border-r border-ink px-2.5 py-1" />
                      <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.igstAmount)}</td>
                    </>
                  ) : (
                    <>
                      <td className="border-r border-ink px-2.5 py-1" />
                      <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.cgstAmount)}</td>
                      <td className="border-r border-ink px-2.5 py-1" />
                      <td className="border-r border-ink px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.sgstAmount)}</td>
                    </>
                  )}
                  <td className="px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.totalTax)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
            <div className="border-t border-ink p-2.5 break-inside-avoid">
              <span className="font-bold">Tax Amount (in words) : </span>
              INR {amountToWordsWithPaise(hsnTotal.totalTax)} Only
            </div>
          </>
        )}

        {(company.bankName || company.terms) && (
          <div className="grid grid-cols-2 gap-4 border-t border-ink p-2.5 text-[10.5px] break-inside-avoid">
            {company.bankName && (
              <div>
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Bank Details</div>
                <div className="font-mono font-tabular leading-snug text-ink-body">
                  {company.bankName}
                  {company.bankAcc && (
                    <>
                      <br />
                      A/C {company.bankAcc}
                    </>
                  )}
                  {company.ifsc && (
                    <>
                      <br />
                      IFSC {company.ifsc}
                    </>
                  )}
                  {company.branch && (
                    <>
                      <br />
                      {company.branch}
                    </>
                  )}
                  {company.upi && (
                    <>
                      <br />
                      UPI {company.upi}
                    </>
                  )}
                </div>
              </div>
            )}
            {company.terms && (
              <div>
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Terms</div>
                <p className="leading-snug text-ink-soft">{company.terms}</p>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-ink p-2.5 text-[10.5px] leading-snug text-ink-soft break-inside-avoid">
          <div className="mb-0.5 font-bold text-ink">Declaration</div>
          We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. We hereby certify that the goods mentioned in this invoice are
          warranted to be of the nature and quality purported to be.
        </div>

        <div className="border-t border-ink p-2.5 break-inside-avoid">
          <div className="mt-1 grid grid-cols-2 gap-8 text-center text-[10.5px]">
            <div className="flex flex-col">
              <div className="h-10" />
              <div className="border-t border-ink pt-1">Customer&apos;s Sign</div>
            </div>
            <div className="flex flex-col">
              <div className="flex h-10 items-end justify-center pb-1">
                {company.signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.signatureUrl} alt="Authorised signature" className="h-9 object-contain" />
                ) : (
                  <span className="text-[11.5px] font-semibold text-ink">{company.signatoryName || ''}</span>
                )}
              </div>
              <div className="border-t border-ink pt-1">
                Authorised Signatory
                <div className="text-[9.5px] font-normal text-ink-faint">for {company.name}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pt-1 text-center text-[9.5px] text-ink-faint">This is a Computer Generated Invoice — End of Invoice</div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 py-[1px]">
      <span className="text-ink-faint">{k}</span>
      <span className={mono ? 'font-mono font-tabular' : ''}>{v}</span>
    </div>
  );
}
