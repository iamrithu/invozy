// Server-only data loaders for printed documents. Deliberately NOT a
// 'use server' module and NOT auth-checked: the /print/** pages call these
// after verifying their own signed `?t=` token (the headless PDF browser
// has no session), and the in-app pages call them after requireUser().
// Never import this from a client component.

import { prisma } from '@/lib/prisma';
import { COMPANY_ID } from '@/lib/company-id';
import { inlineImage } from '@/app/print/inline-image';
import { customerDisplayName } from '@/lib/customer';
import { addressLine, type BuyerInfo, type LetterheadCompany } from './clean-doc';
import { istDateString } from './format';
import { getAppSettings } from '@/lib/settings';

/** The company fields a letterhead and signatory block print. Read
 * directly by id — getCompany() would demand a signed-in user. The logo
 * size comes from Company → PDF layout. */
export async function loadLetterheadCompany(): Promise<LetterheadCompany | null> {
  const [company, settings] = await Promise.all([
    prisma.company.findUnique({
      where: { id: COMPANY_ID },
      select: {
        name: true,
        address: true,
        pincode: true,
        state: true,
        gstin: true,
        fssaiNo: true,
        phone: true,
        altPhone: true,
        email: true,
        logoUrl: true,
        signatoryName: true,
        signatureUrl: true,
      },
    }),
    getAppSettings(),
  ]);
  return company && { ...company, logoScale: settings.pdfLayout.logoScale };
}

/** loadLetterheadCompany for a /print/** page: the logo and signature are
 * inlined as data URLs (src/app/print/inline-image.ts), so the headless
 * render never waits on, or silently loses, an image fetch. */
export async function loadPrintLetterhead(): Promise<LetterheadCompany | null> {
  const company = await loadLetterheadCompany();
  if (!company) return null;
  const [logoUrl, signatureUrl] = await Promise.all([inlineImage(company.logoUrl), inlineImage(company.signatureUrl)]);
  return { ...company, logoUrl, signatureUrl };
}

export const BUYER_SELECT = {
  name: true,
  shopName: true,
  contact: true,
  address: true,
  pincode: true,
  state: true,
  gstin: true,
  phone: true,
} as const;

type BuyerRow = { name: string; shopName: string | null; contact: string | null; address: string | null; pincode: string | null; state: string; gstin: string | null; phone: string | null };

/** A customer as the "Bill to" block prints it: shop name first, the
 * person (or contact) under it. */
export function toBuyerInfo(c: BuyerRow): BuyerInfo {
  return {
    name: customerDisplayName(c),
    subName: c.shopName ? c.name : c.contact || null,
    address: addressLine(c.address, c.pincode),
    state: c.state,
    gstin: c.gstin || null,
    phone: c.phone || null,
  };
}

// ---------------------------------------------------------------------------
// Payment receipts
// ---------------------------------------------------------------------------

export type ReceiptDoc = {
  id: string;
  receiptNo: string | null;
  date: string;
  amount: number;
  mode: string | null;
  reference: string | null;
  /** Set when this payment is a credit note applied to the invoice — those
   * print as the credit note itself, never as a receipt. */
  creditNoteId: string | null;
  customer: BuyerInfo;
  invoice: { id: string; number: string; date: string; total: number };
  /** Everything received against the invoice up to and including this
   * payment (credit notes included), and what was still due after it. */
  paidToDate: number;
  balanceAfter: number;
};

export async function loadReceiptDocument(paymentId: string): Promise<ReceiptDoc | null> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      receiptNo: true,
      date: true,
      amount: true,
      mode: true,
      reference: true,
      creditNoteId: true,
      createdAt: true,
      invoice: {
        select: {
          id: true,
          number: true,
          date: true,
          total: true,
          customer: { select: BUYER_SELECT },
          payments: { select: { id: true, amount: true, date: true, createdAt: true } },
        },
      },
    },
  });
  if (!payment) return null;
  const { invoice } = payment;
  // "Paid to date" as of this receipt, not as of today — payments taken
  // later don't belong on it. Same-day payments order by when they were
  // recorded.
  const at = (p: { date: Date; createdAt: Date }) => [p.date.getTime(), p.createdAt.getTime()] as const;
  const [d0, c0] = at(payment);
  const paidToDate = invoice.payments
    .filter((p) => {
      const [d, c] = at(p);
      return d < d0 || (d === d0 && (c < c0 || p.id === payment.id));
    })
    .reduce((s, p) => s + Number(p.amount), 0);
  const total = Number(invoice.total);
  return {
    id: payment.id,
    receiptNo: payment.receiptNo,
    date: istDateString(payment.date),
    amount: Number(payment.amount),
    mode: payment.mode,
    reference: payment.reference,
    creditNoteId: payment.creditNoteId,
    customer: toBuyerInfo(invoice.customer),
    invoice: { id: invoice.id, number: invoice.number, date: istDateString(invoice.date), total },
    paidToDate,
    balanceAfter: Math.max(0, total - paidToDate),
  };
}
