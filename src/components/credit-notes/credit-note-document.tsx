import {
  AmountInWords,
  BuyerBlock,
  CleanDoc,
  Closing,
  DocTable,
  Lab,
  Letterhead,
  MetaStrip,
  Parties,
  SignatureRow,
  Td,
  Th,
  TotalsTable,
  Tr,
  type LetterheadCompany,
  type TotalRow,
} from '@/components/print/clean-doc';
import { fmtAmount, fmtDocDate, fmtQty, fmtQtyUnit, fmtRupees } from '@/components/print/format';
import { gstStateCode } from '@/lib/gst-state-codes';
import { lineDiscounted, lineNet, round2 } from './credit-note-math';
import type { CreditNoteDoc } from './credit-note-data';

const pct = (n: number) => `${fmtQty(n)}%`;

/** The totals column, rebuilt from the stored figures: gross → item
 * discount → part credit for used/damaged goods → the invoice's bill
 * discount (when it had one) → the note's deduction → taxable → GST at the
 * invoice's own rates → round off → total. */
function totalRows(note: CreditNoteDoc): TotalRow[] {
  const gross = round2(note.items.reduce((s, it) => s + it.qty * it.rate, 0));
  const discounted = round2(note.items.reduce((s, it) => s + lineDiscounted(it), 0));
  const net = round2(note.items.reduce((s, it) => s + lineNet(it), 0));
  const itemDiscount = round2(gross - discounted);
  const partCredit = round2(discounted - net);
  const billDiscount = round2(net - note.deduction - note.taxable);
  const roundOff = round2(note.total - (note.taxable + note.cgst + note.sgst + note.igst));
  const rows: TotalRow[] = [{ label: 'Gross amount', value: fmtAmount(gross) }];
  if (itemDiscount > 0.004) rows.push({ label: 'Item discount', value: fmtAmount(-itemDiscount) });
  if (partCredit > 0.004) rows.push({ label: 'Less: part credit', value: fmtAmount(-partCredit) });
  if (billDiscount > 0.004) rows.push({ label: 'Bill discount', value: fmtAmount(-billDiscount) });
  if (note.deduction > 0.004) rows.push({ label: note.deductionReason || 'Deduction', value: fmtAmount(-note.deduction) });
  rows.push({ label: 'Taxable value', value: fmtAmount(note.taxable), kind: 'sep' });
  if (note.interState) {
    if (note.igstRate > 0) rows.push({ label: `IGST ${pct(note.igstRate)}`, value: fmtAmount(note.igst) });
  } else {
    if (note.cgstRate > 0) rows.push({ label: `CGST ${pct(note.cgstRate)}`, value: fmtAmount(note.cgst) });
    if (note.sgstRate > 0) rows.push({ label: `SGST ${pct(note.sgstRate)}`, value: fmtAmount(note.sgst) });
  }
  rows.push({ label: 'Round off', value: fmtAmount(roundOff) });
  rows.push({ label: 'Total credit', value: fmtRupees(note.total), kind: 'grand' });
  return rows;
}

/** A GST credit note in the Clean style — rendered by the PDF print page
 * (src/app/print/credit-notes/[id]) and the on-screen detail page alike. */
export function CreditNoteDocument({ note, company }: { note: CreditNoteDoc; company: LetterheadCompany }) {
  return (
    <CleanDoc title="Credit note">
      <Letterhead company={company} />
      <MetaStrip
        items={[
          { label: 'Credit note no.', value: note.number },
          { label: 'Credit note date', value: fmtDocDate(note.date) },
          { label: 'Against invoice', value: note.invoice.number ?? '—' },
          { label: 'Invoice date', value: fmtDocDate(note.invoice.date) },
        ]}
      />
      <Parties
        left={<BuyerBlock label="Issued to" buyer={note.customer} />}
        right={
          <>
            <Lab>Reason</Lab>
            <span>{note.reason || '—'}</span>
            <Lab className="mt-2">Place of supply</Lab>
            <span>
              {note.customer.state} ({gstStateCode(note.customer.state)})
            </span>
            <Lab className="mt-2">Adjustment</Lab>
            <span>
              {note.applied > 0.004 ? `${fmtRupees(note.applied)} adjusted against ${note.invoice.number ?? 'the invoice'}` : 'Not adjusted against the invoice'}
            </span>
            {note.refundDue > 0.004 && <span>{fmtRupees(note.refundDue)} credit to the customer — to be refunded or adjusted</span>}
          </>
        }
      />
      <DocTable>
        <colgroup>
          <col className="w-[34px]" />
          <col />
          <col className="w-[72px]" />
          <col className="w-[70px]" />
          <col className="w-[66px]" />
          <col className="w-[50px]" />
          <col className="w-[54px]" />
          <col className="w-[86px]" />
        </colgroup>
        <thead>
          <tr>
            <Th align="center">S.No</Th>
            <Th>Product</Th>
            <Th>HSN</Th>
            <Th align="right">Qty</Th>
            <Th align="right">Rate</Th>
            <Th align="right">Disc %</Th>
            <Th align="right">Credit</Th>
            <Th align="right">Amount (₹)</Th>
          </tr>
        </thead>
        <tbody>
          {note.items.map((it, i) => (
            <Tr key={i}>
              <Td align="center">{i + 1}</Td>
              <Td>
                {it.name}
                {!it.restock && note.items.some((x) => x.restock) ? ' (not sellable)' : ''}
              </Td>
              <Td>{it.hsn || '—'}</Td>
              <Td align="right">{fmtQtyUnit(it.qty, it.unit)}</Td>
              <Td align="right">{fmtAmount(it.rate)}</Td>
              <Td align="right">{it.discount > 0 ? fmtQty(it.discount) : '—'}</Td>
              <Td align="right">{pct(it.creditPct)}</Td>
              <Td align="right">{fmtAmount(lineNet(it))}</Td>
            </Tr>
          ))}
        </tbody>
      </DocTable>
      <Closing
        left={
          <>
            <AmountInWords amount={note.total} />
            <div>
              <Lab>Declaration</Lab>
              <div>This credit note reduces the value of the invoice above by the amount shown, including the GST charged on it.</div>
            </div>
          </>
        }
        right={<TotalsTable rows={totalRows(note)} />}
      />
      <SignatureRow company={company} />
    </CleanDoc>
  );
}
