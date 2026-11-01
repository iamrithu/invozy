import { todayIst } from '@/lib/dates';
import { BuyerBlock, CleanDoc, DocTable, Lab, Letterhead, MetaStrip, Parties, SignatureRow, Td, Th, TotalTr, Tr, type LetterheadCompany } from './clean-doc';
import { fmtAmount, fmtDocDate, fmtRupees, rupeesInWords } from './format';
import type { CustomerStatement } from './statement-data';

/** "01/04/2026 – 31/10/2026", "Up to 31/10/2026", "All time". */
export function statementPeriodLabel(from: string | null, to: string | null): string {
  if (from && to) return `${fmtDocDate(from)} – ${fmtDocDate(to)}`;
  if (from) return `From ${fmtDocDate(from)}`;
  if (to) return `Up to ${fmtDocDate(to)}`;
  return 'All time';
}

/** A running balance: what the customer owes, or "716.00 Cr" when they
 * hold credit with us (a credit note bigger than what they owed). */
function balanceText(n: number): string {
  return n < -0.004 ? `${fmtAmount(-n)} Cr` : fmtAmount(n);
}

/** A customer's statement of account in the Clean style: opening balance,
 * every invoice (debit) and payment / credit note (credit) in date order
 * with a running balance, and the closing balance in figures and words.
 * A positive balance is what the customer owes. */
export function StatementDocument({ statement: st, company }: { statement: CustomerStatement; company: LetterheadCompany }) {
  const asOf = st.to ?? todayIst();
  const owes = st.closing >= -0.004;
  return (
    <CleanDoc title="Statement of account">
      <Letterhead company={company} />
      <MetaStrip
        items={[
          { label: 'Period', value: statementPeriodLabel(st.from, st.to) },
          { label: 'Opening balance', value: fmtRupees(st.opening) },
          { label: 'Invoiced', value: fmtRupees(st.totalDebit) },
          { label: 'Received', value: fmtRupees(st.totalCredit) },
        ]}
      />
      <Parties
        left={<BuyerBlock label="Customer" buyer={st.customer} />}
        right={
          <>
            <Lab>{owes ? `Balance due as on ${fmtDocDate(asOf)}` : `Advance with us as on ${fmtDocDate(asOf)}`}</Lab>
            <span className="mb-1 mt-0.5 text-[20px] leading-[1.2]">{fmtRupees(Math.abs(st.closing))}</span>
            <span>{rupeesInWords(st.closing)}</span>
          </>
        }
      />
      <DocTable>
        <colgroup>
          <col className="w-[70px]" />
          <col />
          <col className="w-[150px]" />
          <col className="w-[80px]" />
          <col className="w-[80px]" />
          <col className="w-[86px]" />
        </colgroup>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Particulars</Th>
            <Th>Ref</Th>
            <Th align="right">Debit (₹)</Th>
            <Th align="right">Credit (₹)</Th>
            <Th align="right">Balance (₹)</Th>
          </tr>
        </thead>
        <tbody>
          <Tr>
            <Td>{st.from ? fmtDocDate(st.from) : '—'}</Td>
            <Td>Opening balance</Td>
            <Td />
            <Td />
            <Td />
            <Td align="right">{balanceText(st.opening)}</Td>
          </Tr>
          {st.rows.map((r, i) => (
            <Tr key={i}>
              <Td>{fmtDocDate(r.date)}</Td>
              <Td>{r.particulars}</Td>
              <Td className="break-words">{r.ref}</Td>
              <Td align="right">{r.debit ? fmtAmount(r.debit) : ''}</Td>
              <Td align="right">{r.credit ? fmtAmount(r.credit) : ''}</Td>
              <Td align="right">{balanceText(r.balance)}</Td>
            </Tr>
          ))}
          {st.rows.length === 0 && (
            <Tr>
              <Td />
              <Td colSpan={5}>No invoices or payments in this period.</Td>
            </Tr>
          )}
          <TotalTr>
            <Td />
            <Td>Closing balance</Td>
            <Td />
            <Td align="right">{fmtAmount(st.totalDebit)}</Td>
            <Td align="right">{fmtAmount(st.totalCredit)}</Td>
            <Td align="right">{balanceText(st.closing)}</Td>
          </TotalTr>
        </tbody>
      </DocTable>
      <SignatureRow
        company={company}
        left={<span>Please check this statement and let us know of any difference. Payments made after {fmtDocDate(asOf)} are not shown.</span>}
      />
    </CleanDoc>
  );
}
