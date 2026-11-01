'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Boxes, ChevronLeft, ChevronRight, Download, FileText, Loader2, MapPin, Truck, Wallet, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useLoadingSheet } from '@/hooks/use-reports';
import { fmtInr } from '@/lib/gst';
import { downloadFile } from '@/components/reports/download-file';
import type { LoadingGroup, LoadingGroupBy, LoadingSheet, LoadingSheetParams } from './loading-sheet-data';

const DAY_MS = 86_400_000;

function shiftDay(date: string, days: number): string {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Mirrors loading-sheet-data.ts's loadingSheetQuery — that module imports
 * Prisma, so the client can't import it. */
function queryOf(p: LoadingSheetParams): string {
  const q = new URLSearchParams({ date: p.date, group: p.group });
  if (p.includeDrafts) q.set('drafts', '1');
  return q.toString();
}

/** The daily loading sheet: pick a day, group by vehicle or route, and get
 * — per group — what to load (main units, "4 Box + 6 Pc") and where it
 * goes (drop list with cash to collect). "Download PDF" prints the same
 * thing one group per page, with a signature column, for the drivers. */
export function LoadingSheetClient({ initial, today, currency }: { initial: LoadingSheet; today: string; currency?: string }) {
  const [params, setParams] = useState<LoadingSheetParams>({ date: initial.date, group: initial.group, includeDrafts: initial.includeDrafts });
  const { data, isFetching, isPlaceholderData } = useLoadingSheet(params, initial);
  const sheet = data ?? initial;
  const [downloading, setDownloading] = useState(false);
  const money = (n: number) => fmtInr(n, currency);

  // Keep the address bar in step (bookmarkable, survives a refresh) without
  // a server round-trip — the query above already fetched the data.
  useEffect(() => {
    window.history.replaceState(null, '', `/reports/loading-sheet?${queryOf(params)}`);
  }, [params]);

  const set = (patch: Partial<LoadingSheetParams>) => setParams((p) => ({ ...p, ...patch }));

  async function downloadPdf() {
    setDownloading(true);
    try {
      await downloadFile(`/api/pdf/loading-sheet?${queryOf(params)}`, `asb-loading-sheet-${params.date}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not prepare the PDF.');
    } finally {
      setDownloading(false);
    }
  }

  const dateLabel = new Date(`${sheet.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const stale = isFetching && isPlaceholderData;

  return (
    <div>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-[12px] font-bold text-ink-faint hover:text-ink">
        <ArrowLeft size={13} /> Reports
      </Link>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
            <Truck size={18} className="text-brand" /> Loading sheet
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            {dateLabel}
            {sheet.date === today ? ' · today' : ''}
          </p>
        </div>
        <Button type="button" size="sm" onClick={downloadPdf} disabled={downloading || sheet.groups.length === 0}>
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download PDF
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl2 border border-line bg-surface p-3 shadow-card">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous day" onClick={() => set({ date: shiftDay(params.date, -1) })}>
            <ChevronLeft size={15} />
          </Button>
          <input
            type="date"
            value={params.date}
            onChange={(e) => e.target.value && set({ date: e.target.value })}
            className="h-8 rounded-sm2 border border-line bg-bg px-2 font-mono text-[12px] text-ink-body outline-none focus:border-primary"
            aria-label="Date"
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Next day" onClick={() => set({ date: shiftDay(params.date, 1) })}>
            <ChevronRight size={15} />
          </Button>
          {params.date !== today && (
            <button type="button" onClick={() => set({ date: today })} className="ml-1 text-[11.5px] font-bold text-brand hover:underline">
              Today
            </button>
          )}
        </div>

        <GroupToggle value={params.group} onChange={(group) => set({ group })} />

        <span className="flex items-center gap-2">
          <Switch id="loading-drafts" checked={params.includeDrafts} onChange={(e) => set({ includeDrafts: e.target.checked })} />
          <label htmlFor="loading-drafts" className="cursor-pointer text-[12px] font-semibold text-ink-soft">
            Include drafts
          </label>
        </span>

        {stale && <Loader2 size={14} className="ml-auto animate-spin text-ink-faint" />}
      </div>

      <div className={`transition-opacity ${stale ? 'opacity-60' : ''}`}>
        <div className="mb-3.5 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile icon={<FileText size={14} />} label="Invoices" value={String(sheet.totals.invoices)} sub={`${sheet.totals.shops} shop${sheet.totals.shops === 1 ? '' : 's'}`} />
          <Tile icon={<Boxes size={14} />} label="Total load" value={sheet.loadLabel} />
          <Tile icon={<IndianRupee size={14} />} label="Invoice value" value={money(sheet.totals.value)} />
          <Tile icon={<Wallet size={14} />} label="Cash to collect" value={money(sheet.totals.toCollect)} />
        </div>

        {sheet.groups.length === 0 ? (
          <div className="rounded-xl2 border border-line bg-surface p-8 text-center shadow-card">
            <p className="text-[13px] font-bold text-ink">No invoices dated {dateLabel}.</p>
            {!params.includeDrafts && <p className="mt-1 text-[12px] text-ink-faint">Drafts aren’t included — switch on “Include drafts” to see bills not sent yet.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {sheet.groups.map((g) => (
              <GroupCard key={g.key} group={g} groupBy={sheet.group} money={money} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupToggle({ value, onChange }: { value: LoadingGroupBy; onChange: (v: LoadingGroupBy) => void }) {
  return (
    <div className="inline-flex rounded-sm2 bg-surface-alt p-0.5 text-[12px] font-bold" role="radiogroup" aria-label="Group by">
      {(['vehicle', 'route'] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`flex items-center gap-1.5 rounded-sm2 px-2.5 py-1 transition-colors ${value === k ? 'bg-surface text-ink shadow-card' : 'text-ink-faint hover:text-ink'}`}
        >
          {k === 'vehicle' ? <Truck size={12} /> : <MapPin size={12} />}
          {k === 'vehicle' ? 'By vehicle' : 'By route'}
        </button>
      ))}
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg2 border border-line bg-surface p-2.5 shadow-card">
      <div className="flex h-6 w-6 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">{icon}</div>
      <div className="mt-1.5 font-mono text-[15px] font-extrabold text-ink">{value}</div>
      <div className="mt-0.5 text-[10.5px] text-ink-faint">
        {label}
        {sub ? ` · ${sub}` : ''}
      </div>
    </div>
  );
}

function GroupCard({ group, groupBy, money }: { group: LoadingGroup; groupBy: LoadingGroupBy; money: (n: number) => string }) {
  const Icon = groupBy === 'vehicle' ? Truck : MapPin;
  return (
    <section className="rounded-xl2 border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-3.5 py-2.5">
        <div className={`flex items-center gap-2 text-[14px] font-extrabold ${group.unassigned ? 'text-ink-soft' : 'text-ink'}`}>
          <Icon size={14} className="text-brand" />
          <span className={groupBy === 'vehicle' && !group.unassigned ? 'font-mono' : ''}>{group.label}</span>
          {group.driver && <span className="text-[11.5px] font-semibold text-ink-faint">· {group.driver}</span>}
        </div>
        <div className="text-[11.5px] text-ink-faint">
          {group.totals.invoices} drop{group.totals.invoices === 1 ? '' : 's'} · <b className="text-ink-soft">{group.loadLabel}</b> · {money(group.totals.value)}
          {group.totals.toCollect > 0.004 && (
            <>
              {' '}
              · collect <b className="text-red">{money(group.totals.toCollect)}</b>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr]">
        <div className="border-b border-line p-3.5 lg:border-b-0 lg:border-r">
          <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Load list</h3>
          <ul className="space-y-1">
            {group.load.map((item) => (
              <li key={item.key} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="min-w-0">
                  <span className="font-semibold text-ink-body">{item.name}</span>
                  {item.category && <span className="ml-1.5 text-[10.5px] text-ink-faint">{item.category}</span>}
                </span>
                <span className="flex-shrink-0 font-mono font-bold text-ink">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-3.5">
          <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Drop list</h3>
          <ol className="divide-y divide-line">
            {group.drops.map((d, i) => (
              <li key={d.invoiceId} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                <span className="mt-px w-5 flex-shrink-0 text-right font-mono text-[11px] font-bold text-ink-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-ink">
                    {d.customer}
                    {d.contactName && <span className="font-normal text-ink-faint"> · {d.contactName}</span>}
                  </div>
                  {(d.address || d.phone) && <div className="text-[11px] text-ink-faint">{[d.address, d.phone].filter(Boolean).join(' · ')}</div>}
                  {d.note && <div className="text-[11px] italic text-ink-soft">{d.note}</div>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <Link href={`/invoices/${d.invoiceId}`} className="font-mono text-[11px] font-semibold text-ink-soft hover:text-brand">
                    {d.number}
                    {d.status === 'DRAFT' && <span className="ml-1 font-sans text-[10px] font-bold uppercase text-gold">Draft</span>}
                  </Link>
                  <div className="font-mono text-[12px] font-bold text-ink">{money(d.amount)}</div>
                  <div className={`text-[11px] font-bold ${d.toCollect > 0.004 ? 'text-red' : 'text-green'}`}>{d.toCollect > 0.004 ? `Collect ${money(d.toCollect)}` : 'Paid'}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
