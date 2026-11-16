// Tally XML export — sales invoices and credit notes as Tally vouchers, plus
// an optional "masters" file that creates the ledgers those vouchers post
// to. Pure functions over plain data (no Prisma, no server imports), so the
// Tally dialog on the Reports page can import the defaults and labels too;
// the route handler (src/app/api/export/tally/route.ts) does the loading.
//
// Vouchers are written in Accounting Voucher View (ISINVOICE No): one party
// line and one line per sales/tax ledger, no stock items — the accountant's
// Tally doesn't need our product list to take the GST figures in.
//
// Tally's sign convention for ALLLEDGERENTRIES.LIST: a DEBIT is a negative
// AMOUNT with ISDEEMEDPOSITIVE Yes; a CREDIT is a positive AMOUNT with
// ISDEEMEDPOSITIVE No; every voucher's amounts must sum to exactly zero.
// So a Sales voucher debits the party (−total) and credits Sales, CGST,
// SGST/IGST and Round Off; a Credit Note is the mirror image, debiting
// Sales Return and the tax ledgers and crediting the party.

export type TallyLedgers = {
  sales: string;
  cgst: string;
  sgst: string;
  igst: string;
  roundOff: string;
  salesReturn: string;
};

export const DEFAULT_TALLY_LEDGERS: TallyLedgers = {
  sales: 'Sales',
  cgst: 'CGST',
  sgst: 'SGST',
  igst: 'IGST',
  roundOff: 'Round Off',
  salesReturn: 'Sales Return',
};

/** Field order + wording for the "Tally ledger names" dialog. `group` is
 * the Tally group each ledger belongs under — shown as a hint, and used
 * for the masters file. */
export const TALLY_LEDGER_FIELDS: { key: keyof TallyLedgers; label: string; group: string }[] = [
  { key: 'sales', label: 'Sales', group: 'Sales Accounts' },
  { key: 'salesReturn', label: 'Sales return (credit notes)', group: 'Sales Accounts' },
  { key: 'cgst', label: 'CGST (output)', group: 'Duties & Taxes' },
  { key: 'sgst', label: 'SGST (output)', group: 'Duties & Taxes' },
  { key: 'igst', label: 'IGST (output)', group: 'Duties & Taxes' },
  { key: 'roundOff', label: 'Round off', group: 'Indirect Expenses' },
];

/** Company.tallyLedgers (free-form JSON, null until first saved) merged
 * over the defaults — a blank or missing name falls back to the default
 * instead of posting to a ledger called "". */
export function resolveTallyLedgers(stored: unknown): TallyLedgers {
  const out = { ...DEFAULT_TALLY_LEDGERS };
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const key of Object.keys(out) as (keyof TallyLedgers)[]) {
      const v = (stored as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) out[key] = v.trim();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Documents in, XML out
// ---------------------------------------------------------------------------

export type TallyParty = {
  /** Ledger name — the customer's shop name, else their name. */
  name: string;
  gstin?: string | null;
  state?: string | null;
  address?: string | null;
  pincode?: string | null;
};

export type TallyDoc = {
  id: string;
  number: string;
  date: Date;
  party: TallyParty;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  narration?: string | null;
  /** Credit notes only — the invoice it's against, for the bill reference. */
  againstInvoice?: string | null;
};

/** Plain text → XML text. Also drops control characters Tally's parser
 * rejects (anything below 0x20 except tab/newline). */
function x(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function r2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function amt(n: number): string {
  // Avoid "-0.00".
  const v = r2(n);
  return (Object.is(v, -0) ? 0 : v).toFixed(2);
}

/** YYYYMMDD of the India calendar date. */
function tallyDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '');
}

/** `credit` is signed from the credit side: + credits the ledger, − debits
 * it. Converted to Tally's own convention here, in one place. */
function ledgerEntry(ledger: string, credit: number, opts: { party?: boolean; bill?: { name: string; type: 'New Ref' | 'Agst Ref' } } = {}): string {
  const value = r2(credit);
  const debit = value < 0;
  const bill = opts.bill
    ? `
       <BILLALLOCATIONS.LIST>
        <NAME>${x(opts.bill.name)}</NAME>
        <BILLTYPE>${opts.bill.type}</BILLTYPE>
        <AMOUNT>${amt(value)}</AMOUNT>
       </BILLALLOCATIONS.LIST>`
    : '';
  return `
      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>${x(ledger)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>${opts.party ? '\n       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>' : ''}
       <AMOUNT>${amt(value)}</AMOUNT>${bill}
      </ALLLEDGERENTRIES.LIST>`;
}

/** One voucher. Tax heads are rounded to paise first and Round Off is
 * whatever's left between them and the invoice total, so the voucher always
 * balances to the paisa even though the stored tax columns carry more
 * decimals than that. */
function voucher(kind: 'Sales' | 'Credit Note', doc: TallyDoc, ledgers: TallyLedgers): string {
  const s = kind === 'Sales' ? 1 : -1; // + = the non-party side is credited
  const taxable = r2(doc.taxable);
  const cgst = r2(doc.cgst);
  const sgst = r2(doc.sgst);
  const igst = r2(doc.igst);
  const total = r2(doc.total);
  const roundOff = r2(total - (taxable + cgst + sgst + igst));
  const date = tallyDate(doc.date);

  const bill =
    kind === 'Sales'
      ? { name: doc.number, type: 'New Ref' as const }
      : doc.againstInvoice
        ? { name: doc.againstInvoice, type: 'Agst Ref' as const }
        : { name: doc.number, type: 'New Ref' as const };

  const lines = [
    ledgerEntry(doc.party.name, -s * total, { party: true, bill }),
    ledgerEntry(kind === 'Sales' ? ledgers.sales : ledgers.salesReturn, s * taxable),
    cgst ? ledgerEntry(ledgers.cgst, s * cgst) : '',
    sgst ? ledgerEntry(ledgers.sgst, s * sgst) : '',
    igst ? ledgerEntry(ledgers.igst, s * igst) : '',
    roundOff ? ledgerEntry(ledgers.roundOff, s * roundOff) : '',
  ].join('');

  // REMOTEID is a stable id per document, which Tally keeps against the
  // voucher it creates.
  return `
  <TALLYMESSAGE xmlns:UDF="TallyUDF">
   <VOUCHER REMOTEID="asb-${kind === 'Sales' ? 'invoice' : 'credit-note'}-${x(doc.id)}" VCHTYPE="${kind}" ACTION="Create" OBJVIEW="Accounting Voucher View">
    <DATE>${date}</DATE>
    <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
    <VOUCHERTYPENAME>${kind}</VOUCHERTYPENAME>
    <VOUCHERNUMBER>${x(doc.number)}</VOUCHERNUMBER>
    <REFERENCE>${x(kind === 'Sales' ? doc.number : (doc.againstInvoice ?? doc.number))}</REFERENCE>
    <PARTYLEDGERNAME>${x(doc.party.name)}</PARTYLEDGERNAME>
    <PARTYNAME>${x(doc.party.name)}</PARTYNAME>${doc.party.gstin ? `\n    <PARTYGSTIN>${x(doc.party.gstin)}</PARTYGSTIN>` : ''}${doc.party.state ? `\n    <STATENAME>${x(doc.party.state)}</STATENAME>` : ''}
    <NARRATION>${x((doc.narration ?? '').replace(/\s+/g, ' ').trim())}</NARRATION>
    <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
    <ISINVOICE>No</ISINVOICE>${lines}
   </VOUCHER>
  </TALLYMESSAGE>`;
}

function envelope(reportName: 'Vouchers' | 'All Masters', messages: string): string {
  // No SVCURRENTCOMPANY: the file imports into whichever company is open in
  // Tally, rather than failing when its name differs from ours by a letter.
  return `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>${reportName}</REPORTNAME>
   </REQUESTDESC>
   <REQUESTDATA>${messages}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
}

/** Gateway of Tally → Import → Vouchers. */
export function buildTallyVouchersXml(input: { invoices: TallyDoc[]; creditNotes: TallyDoc[]; ledgers: TallyLedgers }): string {
  const messages = [
    ...input.invoices.map((d) => voucher('Sales', d, input.ledgers)),
    ...input.creditNotes.map((d) => voucher('Credit Note', d, input.ledgers)),
  ].join('');
  return envelope('Vouchers', messages);
}

function ledgerMaster(name: string, parent: string, extra = ''): string {
  return `
  <TALLYMESSAGE xmlns:UDF="TallyUDF">
   <LEDGER NAME="${x(name)}" ACTION="Create">
    <NAME.LIST>
     <NAME>${x(name)}</NAME>
    </NAME.LIST>
    <PARENT>${x(parent)}</PARENT>${extra}
   </LEDGER>
  </TALLYMESSAGE>`;
}

const DUTY_HEAD: Partial<Record<keyof TallyLedgers, string>> = { cgst: 'Central Tax', sgst: 'State Tax', igst: 'Integrated Tax' };

/** Gateway of Tally → Import → Masters: the six posting ledgers plus one
 * Sundry Debtors ledger per party, so the voucher import never stops on
 * "Ledger does not exist". Ledgers the company already has are reported
 * as duplicates by Tally and left alone. */
export function buildTallyMastersXml(input: { parties: TallyParty[]; ledgers: TallyLedgers }): string {
  const seen = new Set<string>();
  const once = (name: string) => {
    const k = name.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };

  const posting = TALLY_LEDGER_FIELDS.filter((f) => once(input.ledgers[f.key])).map((f) => {
    const head = DUTY_HEAD[f.key];
    const extra = head
      ? `
    <TAXTYPE>GST</TAXTYPE>
    <GSTDUTYHEAD>${head}</GSTDUTYHEAD>`
      : '';
    return ledgerMaster(input.ledgers[f.key], f.group, extra);
  });

  const parties = input.parties
    .filter((p) => p.name.trim() && once(p.name))
    .map((p) => {
      const addressLines = (p.address ?? '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4);
      const address = addressLines.length
        ? `
    <ADDRESS.LIST TYPE="String">${addressLines.map((l) => `\n     <ADDRESS>${x(l)}</ADDRESS>`).join('')}
    </ADDRESS.LIST>`
        : '';
      const extra = `
    <ISBILLWISEON>Yes</ISBILLWISEON>
    <COUNTRYNAME>India</COUNTRYNAME>${p.state ? `\n    <LEDSTATENAME>${x(p.state)}</LEDSTATENAME>` : ''}${p.pincode ? `\n    <PINCODE>${x(p.pincode)}</PINCODE>` : ''}${
      p.gstin ? `\n    <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>\n    <PARTYGSTIN>${x(p.gstin)}</PARTYGSTIN>` : ''
    }${address}`;
      return ledgerMaster(p.name, 'Sundry Debtors', extra);
    });

  return envelope('All Masters', [...posting, ...parties].join(''));
}
