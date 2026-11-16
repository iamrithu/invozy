'use client';

import { AlertTriangle, Banknote, CheckCircle2, Clock, Receipt } from 'lucide-react';
import type { InvoiceBucket, InvoiceSummary } from '@/actions/invoices';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

const STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID'] as const;
const LABEL: Record<string, string> = { DRAFT: 'draft', SENT: 'sent', PARTIALLY_PAID: 'part-paid', PAID: 'paid', OVERDUE: 'overdue' };
const PICK_LABEL: Record<string, string> = { DRAFT: 'Draft', SENT: 'Sent', PARTIALLY_PAID: 'Part-paid', PAID: 'Paid', OVERDUE: 'Overdue' };

export type Selection = {
  count: number;
  /** Sent, part-paid and paid invoices picked: their total and what's paid / owed. */
  issued: number;
  paid: number;
  owed: number;
  owedCount: number;
  overdue: number;
  overdueCount: number;
  /** Drafts picked: their count and value (nothing paid or owed yet). */
  draftCount: number;
  drafts: number;
  byStatus: Record<string, number>;
};

/** Adds up the picked statuses from the per-status summary — the same
 * union the list's WHERE takes: each picked status whole, and Overdue as
 * the late part of Sent / Part-paid not already picked. No pick = all. */
export function selectionTotals(summary: InvoiceSummary | undefined, picked: string[]): Selection {
  const sel: Selection = { count: 0, issued: 0, paid: 0, owed: 0, owedCount: 0, overdue: 0, overdueCount: 0, draftCount: 0, drafts: 0, byStatus: {} };
  if (!summary) return sel;
  const want = picked.length ? picked : [...STATUSES];
  const add = (status: string, b: InvoiceBucket) => {
    if (!b.count) return;
    sel.count += b.count;
    sel.byStatus[status] = (sel.byStatus[status] ?? 0) + b.count;
    if (status === 'DRAFT') {
      sel.draftCount += b.count;
      sel.drafts += b.total;
      return;
    }
    sel.issued += b.total;
    sel.paid += b.paid;
    sel.owed += b.balance;
    if (b.balance > 0.004) sel.owedCount += b.count;
  };
  for (const s of STATUSES) if (want.includes(s)) add(s, summary[s]);
  for (const s of ['SENT', 'PARTIALLY_PAID'] as const) {
    const late = summary.overdue[s];
    if (want.includes('OVERDUE') && !want.includes(s)) add(s, late);
    if (want.includes(s) || want.includes('OVERDUE')) {
      sel.overdue += late.balance;
      sel.overdueCount += late.count;
    }
  }
  return sel;
}

/** The totals of exactly the invoices listed — "All" adds everything,
 * "Paid" only paid, "Paid + Draft" both — in the Dashboard's structure:
 * Total billed = Paid + Unpaid for sent/paid invoices, or, once drafts are
 * in the pick, Overall = Paid + Remaining (drafts + unpaid). Every amount in
 * full rupees, GST included (what the customer pays). */
export function InvoiceTotals({ sel, picked, periodLabel, loading }: { sel: Selection; picked: string[]; periodLabel: string; loading?: boolean }) {
  const withDrafts = sel.draftCount > 0;
  const total = sel.issued + sel.drafts;
  const remaining = sel.owed + sel.drafts;
  const pct = total > 0.004 ? Math.round((sel.paid / total) * 100) : null;
  const pickText = picked.length ? picked.map((p) => PICK_LABEL[p] ?? p).join(' + ') : 'All statuses';
  const breakdown = STATUSES.filter((s) => sel.byStatus[s]).map((s) => `${sel.byStatus[s]} ${LABEL[s]}`);

  const parts = [
    { key: 'paid', label: 'Paid', value: sel.paid, cls: 'bg-green' },
    { key: 'draft', label: 'Drafts', value: sel.drafts, cls: 'bg-[hsl(0_0%_78%)] dark:bg-[hsl(0_0%_40%)]' },
    { key: 'due', label: 'Unpaid, not yet due', value: Math.max(0, sel.owed - sel.overdue), cls: 'bg-gold' },
    { key: 'late', label: 'Overdue', value: sel.overdue, cls: 'bg-red' },
  ].filter((p) => p.value > 0.004);

  return (
    <section aria-label="Totals of the invoices listed" className={cn('mb-4 rounded-xl2 border border-line bg-surface shadow-card transition-opacity', loading && 'opacity-60')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line px-4 py-2.5">
        <h2 className="text-[13px] font-extrabold text-ink">Adding up: {pickText}</h2>
        <span className="text-[11.5px] text-ink-faint">{periodLabel} · amounts include GST</span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        <Cell icon={Receipt} label="Invoices" value={sel.count.toLocaleString('en-IN')} sub={breakdown.length ? breakdown.join(' · ') : 'None match these filters'} />
        <Cell
          icon={Banknote}
          label={withDrafts && sel.issued > 0.004 ? 'Overall' : withDrafts ? 'Drafts total' : 'Total billed'}
          value={fmtInr(total)}
          sub={withDrafts && sel.issued > 0.004 ? `${fmtInr(sel.issued)} sent and paid + ${fmtInr(sel.drafts)} in drafts` : withDrafts ? 'Not issued yet' : 'Sent and paid invoices'}
        />
        <Cell icon={CheckCircle2} tone="green" label="Paid" value={fmtInr(sel.paid)} sub={pct === null ? 'Nothing to pay yet' : `${pct}% of the ${withDrafts ? 'overall' : 'total'}`} />
        <Cell
          icon={Clock}
          tone={sel.overdue > 0.004 ? 'red' : remaining > 0.004 ? 'gold' : undefined}
          label={withDrafts ? 'Remaining' : 'Unpaid'}
          value={fmtInr(remaining)}
          badge={sel.overdue > 0.004 ? `${fmtInr(sel.overdue)} overdue` : undefined}
          badgeTitle={`${sel.overdueCount} invoice${sel.overdueCount === 1 ? '' : 's'} past the due date`}
          sub={
            withDrafts
              ? `${fmtInr(sel.drafts)} in drafts + ${fmtInr(sel.owed)} unpaid`
              : sel.owedCount > 0
                ? `${sel.owedCount} invoice${sel.owedCount === 1 ? '' : 's'} still owed`
                : total > 0.004
                  ? 'Everything is paid'
                  : 'Nothing owed'
          }
        />
      </div>
      {parts.length > 0 && (
        <div className="border-t border-line px-4 py-2.5">
          <div className="flex h-2 w-full gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
            {parts.map((p) => (
              <span key={p.key} className={cn('h-full min-w-[3px] rounded-full', p.cls)} style={{ flex: `${p.value} 1 0%` }} title={`${p.label} · ${fmtInr(p.value)}`} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
            {parts.map((p) => (
              <span key={p.key} className="flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-full', p.cls)} aria-hidden />
                <span className="font-mono font-semibold text-ink-body">{Math.max(1, Math.round((p.value / total) * 100))}%</span> {p.label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Cell({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  badge,
  badgeTitle,
}: {
  icon: typeof Receipt;
  tone?: 'green' | 'gold' | 'red';
  label: string;
  value: string;
  sub: string;
  badge?: string;
  badgeTitle?: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
        <span
          className={cn(
            'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm2',
            tone === 'green' ? 'bg-green-soft text-green' : tone === 'gold' ? 'bg-gold-soft text-gold' : tone === 'red' ? 'bg-red-soft text-red' : 'bg-surface-alt text-ink-soft'
          )}
        >
          <Icon size={13} />
        </span>
        {label}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="font-mono text-[18px] font-bold leading-tight text-ink">{value}</span>
        {badge && (
          <span title={badgeTitle} className="flex items-center gap-1 rounded-full bg-red-soft px-1.5 py-0.5 text-[10px] font-bold text-red">
            <AlertTriangle size={10} /> {badge}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-ink-faint">{sub}</div>
    </div>
  );
}
