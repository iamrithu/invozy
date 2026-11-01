import { BuyerBlock, CleanDoc, Lab, Letterhead, MetaStrip, Parties, SignatureRow, type LetterheadCompany } from './clean-doc';
import { fmtDocDate, fmtRupees, rupeesInWords } from './format';
import type { ReceiptDoc } from './print-data';

/** A payment receipt in the Clean style — about half an A4 page: who paid,
 * how much (in figures and words), how, and where that leaves the invoice
 * it was paid against. */
export function ReceiptDocument({ receipt, company }: { receipt: ReceiptDoc; company: LetterheadCompany }) {
  return (
    <CleanDoc title="Payment receipt">
      <Letterhead company={company} />
      <MetaStrip
        items={[
          { label: 'Receipt no.', value: receipt.receiptNo ?? '—' },
          { label: 'Receipt date', value: fmtDocDate(receipt.date) },
          { label: 'Paid by', value: receipt.mode || '—' },
          { label: 'Reference', value: receipt.reference || '—' },
        ]}
      />
      <Parties
        left={<BuyerBlock label="Received from" buyer={receipt.customer} />}
        right={
          <>
            <Lab>Amount received</Lab>
            <span className="mb-1 mt-0.5 text-[20px] leading-[1.2]">{fmtRupees(receipt.amount)}</span>
            <Lab>In words</Lab>
            <span>{rupeesInWords(receipt.amount)}</span>
          </>
        }
      />
      <MetaStrip
        items={[
          { label: 'Against invoice', value: receipt.invoice.number },
          { label: 'Invoice date', value: fmtDocDate(receipt.invoice.date) },
          { label: 'Invoice total', value: fmtRupees(receipt.invoice.total) },
          { label: 'Paid to date', value: fmtRupees(receipt.paidToDate) },
          { label: 'Balance after', value: fmtRupees(receipt.balanceAfter) },
        ]}
      />
      <SignatureRow company={company} left={<span>Thank you for your payment.</span>} />
    </CleanDoc>
  );
}
