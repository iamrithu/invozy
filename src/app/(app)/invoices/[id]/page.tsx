import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { computeTotals, fmtInr } from '@/lib/gst';
import { StatusBadge } from '@/components/ui/status-badge';
import { PAPER_STYLE } from '@/lib/paper-theme';
import { InvoiceSheet } from '@/components/invoices/invoice-sheet';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invoice, company] = await Promise.all([
    prisma.invoice.findUnique({ where: { id }, include: { customer: true, items: true, payments: true } }),
    getCompany(),
  ]);
  if (!invoice) notFound();

  const lines = invoice.items.map((it) => ({
    lineId: it.id,
    productId: it.productId,
    name: it.name,
    hsn: it.hsn,
    unit: it.unit,
    qty: Number(it.qty),
    rate: Number(it.rate),
    discount: Number(it.discount),
  }));

  const totals = computeTotals(
    lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount })),
    { type: invoice.overallDiscountType, value: Number(invoice.overallDiscountValue) },
    {
      cgstRate: Number(company.cgstRate),
      sgstRate: Number(company.sgstRate),
      igstRate: Number(company.igstRate),
      cgstEnabled: company.cgstEnabled,
      sgstEnabled: company.sgstEnabled,
      igstEnabled: company.igstEnabled,
    },
    company.state,
    invoice.customer.state
  );
  const lineDiscountTotal = lines.reduce((s, l) => s + l.qty * l.rate * (l.discount / 100), 0);
  const totalSavings = lineDiscountTotal + totals.overallDiscountAmount;
  const amountPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/invoices" className="flex items-center gap-1.5 text-[13px] font-bold text-ink-soft">
          <ArrowLeft size={15} /> Back to invoices
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={invoice.status} overdue={invoice.status !== 'PAID' && invoice.due < new Date()} />
          <PrintButton />
        </div>
      </div>

      <div className="invoice-print mx-auto max-w-[760px]" style={PAPER_STYLE}>
        <div className="h-[5px] rounded-t-lg2 bg-brand print:hidden" />
        <InvoiceSheet
          company={{ ...company, cgstRate: Number(company.cgstRate), sgstRate: Number(company.sgstRate), igstRate: Number(company.igstRate) }}
          customer={invoice.customer}
          date={invoice.date.toISOString().slice(0, 10)}
          due={invoice.due.toISOString().slice(0, 10)}
          invoiceNumber={invoice.number}
          lines={lines}
          totals={totals}
          totalSavings={totalSavings}
          discountType={invoice.overallDiscountType}
          discountValue={Number(invoice.overallDiscountValue)}
          editable={false}
        />
        {amountPaid > 0 && (
          <div className="mt-3 flex justify-end">
            <div className="w-full max-w-[280px] rounded-md2 border border-line bg-surface p-3 text-[12px]">
              <div className="flex justify-between text-green">
                <span>Paid</span>
                <span className="font-mono font-bold">−{fmtInr(amountPaid)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-dashed border-line pt-1 text-[13px] font-extrabold text-ink">
                <span>Balance</span>
                <span className="font-mono">{fmtInr(totals.total - amountPaid)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
