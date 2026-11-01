import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { COMPANY_ID } from '@/lib/company-id';
import { verifySignedToken } from '@/lib/signed-token';
import { todayIst } from '@/lib/dates';
import { fmtInr } from '@/lib/gst';
import { PAPER_STYLE } from '@/lib/paper-theme';
import { PrintPageShell } from '@/components/print/print-page-shell';
import { loadLoadingSheet, loadingSheetTokenId, normalizeLoadingParams, type LoadingGroup, type LoadItem } from '@/app/(app)/reports/loading-sheet/loading-sheet-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Loading sheet', robots: { index: false, follow: false } };

/**
 * The loading sheet as the headless PDF renderer prints it
 * (src/app/api/pdf/loading-sheet → renderPrintPage). One section per
 * vehicle/route, each starting on a fresh page so it can be handed to its
 * driver: the load list to tick off at the freezer, then the drop list with
 * a signature column for each shop.
 *
 * Outside the (app) shell and the session proxy — access is a short-lived
 * 'print-loading-sheet' token bound to this exact date/grouping (see
 * loadingSheetTokenId); anything else is a 404.
 */
export default async function PrintLoadingSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);
  const params = normalizeLoadingParams({ date: str(sp.date), group: str(sp.group), drafts: str(sp.drafts) }, todayIst());
  if (verifySignedToken('print-loading-sheet', str(sp.t)) !== loadingSheetTokenId(params)) notFound();

  const [sheet, company] = await Promise.all([
    loadLoadingSheet(params),
    prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { name: true, phone: true, currency: true } }),
  ]);
  const currency = company?.currency ?? 'INR';
  const money = (n: number) => fmtInr(n, currency);
  const dateLabel = new Date(`${sheet.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const groupWord = sheet.group === 'vehicle' ? 'Vehicle' : 'Route';

  return (
    <PrintPageShell>
      <main className="print-doc text-[10.5px] leading-snug text-ink" style={PAPER_STYLE}>
        <header className="mb-3 flex items-end justify-between gap-4 border-b-2 border-ink pb-2">
          <div>
            <div className="text-[15px] font-extrabold">{company?.name ?? 'Loading sheet'}</div>
            <div className="text-[11px] text-ink-soft">
              Loading sheet · {dateLabel} · by {groupWord.toLowerCase()}
              {sheet.includeDrafts ? ' · includes drafts' : ''}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 text-right">
            <Total label="Invoices" value={`${sheet.totals.invoices}`} sub={`${sheet.totals.shops} shop${sheet.totals.shops === 1 ? '' : 's'}`} />
            <Total label="Load" value={sheet.loadLabel} />
            <Total label="Value" value={money(sheet.totals.value)} />
            <Total label="To collect" value={money(sheet.totals.toCollect)} />
          </div>
        </header>

        {sheet.groups.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-ink-soft">No invoices dated {dateLabel}.</p>
        ) : (
          sheet.groups.map((g, i) => <GroupSection key={g.key} group={g} groupWord={groupWord} first={i === 0} money={money} />)
        )}
      </main>
    </PrintPageShell>
  );
}

function Total({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="font-mono text-[12px] font-extrabold">{value}</div>
      {sub && <div className="text-[9px] text-ink-soft">{sub}</div>}
    </div>
  );
}

function GroupSection({ group, groupWord, first, money }: { group: LoadingGroup; groupWord: string; first: boolean; money: (n: number) => string }) {
  // Category subheadings only when there's more than one category — a
  // single heading over the whole list is just noise.
  const categories = new Set(group.load.filter((l) => !l.adhoc).map((l) => l.category));
  const rows: ({ kind: 'cat'; label: string } | { kind: 'item'; item: LoadItem; n: number })[] = [];
  let lastCat: string | null = null;
  group.load.forEach((item, idx) => {
    const cat = item.adhoc ? 'Other items' : item.category || 'Uncategorised';
    if (categories.size > 1 && cat !== lastCat) rows.push({ kind: 'cat', label: cat });
    lastCat = cat;
    rows.push({ kind: 'item', item, n: idx + 1 });
  });

  return (
    <section className={first ? '' : 'break-before-page pt-1'}>
      <div className="mb-2 flex items-baseline justify-between gap-3 rounded-sm2 bg-surface-alt px-2.5 py-1.5">
        <div className="text-[13px] font-extrabold">
          {group.unassigned ? group.label : `${groupWord}: ${group.label}`}
          {group.driver && <span className="ml-2 text-[11px] font-semibold text-ink-soft">Driver: {group.driver}</span>}
        </div>
        <div className="text-[10.5px] text-ink-soft">
          {group.totals.invoices} drop{group.totals.invoices === 1 ? '' : 's'} · Load <b className="text-ink">{group.loadLabel}</b> · Value{' '}
          <b className="text-ink">{money(group.totals.value)}</b> · Collect <b className="text-ink">{money(group.totals.toCollect)}</b>
        </div>
      </div>

      <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-wide">Load list</h3>
      <table className="mb-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-ink text-left text-[9.5px] uppercase tracking-wide text-ink-soft">
            <th className="w-[7mm] py-1 pr-1 font-bold">#</th>
            <th className="py-1 pr-2 font-bold">Product</th>
            <th className="w-[38mm] py-1 pr-2 text-right font-bold">Quantity</th>
            <th className="w-[12mm] py-1 text-center font-bold">Loaded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) =>
            r.kind === 'cat' ? (
              <tr key={`c${idx}`}>
                <td colSpan={4} className="pb-0.5 pt-1.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-soft">
                  {r.label}
                </td>
              </tr>
            ) : (
              <tr key={r.item.key} className="border-b border-line">
                <td className="py-1 pr-1 text-ink-soft">{r.n}</td>
                <td className="py-1 pr-2 font-semibold">{r.item.name}</td>
                <td className="py-1 pr-2 text-right font-mono font-bold">{r.item.label}</td>
                <td className="py-1 text-center">
                  <span className="inline-block h-3 w-3 border border-ink-soft align-middle" />
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-wide">Drop list</h3>
      <table className="mb-2 w-full border-collapse">
        <thead>
          <tr className="border-b border-ink text-left text-[9.5px] uppercase tracking-wide text-ink-soft">
            <th className="w-[7mm] py-1 pr-1 font-bold">#</th>
            <th className="py-1 pr-2 font-bold">Shop</th>
            <th className="w-[24mm] py-1 pr-2 font-bold">Invoice</th>
            <th className="w-[20mm] py-1 pr-2 text-right font-bold">Amount</th>
            <th className="w-[20mm] py-1 pr-2 text-right font-bold">To collect</th>
            <th className="w-[30mm] py-1 font-bold">Signature</th>
          </tr>
        </thead>
        <tbody>
          {group.drops.map((d, idx) => (
            <tr key={d.invoiceId} className="border-b border-line align-top">
              <td className="py-1.5 pr-1 text-ink-soft">{idx + 1}</td>
              <td className="py-1.5 pr-2">
                <div className="font-bold">
                  {d.customer}
                  {d.contactName && <span className="font-normal text-ink-soft"> · {d.contactName}</span>}
                </div>
                {(d.address || d.phone) && <div className="text-[9.5px] text-ink-soft">{[d.address, d.phone].filter(Boolean).join(' · ')}</div>}
                {d.note && <div className="text-[9.5px] italic text-ink-body">{d.note}</div>}
              </td>
              <td className="py-1.5 pr-2 font-mono text-[9.5px]">
                {d.number}
                {d.status === 'DRAFT' && <div className="font-sans text-[9px] font-bold uppercase text-ink-soft">Draft</div>}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono">{money(d.amount)}</td>
              <td className="py-1.5 pr-2 text-right font-mono font-bold">{d.toCollect > 0.004 ? money(d.toCollect) : 'Paid'}</td>
              <td className="py-1.5">
                <div className="mt-3 border-b border-dotted border-ink-soft" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink font-bold">
            <td />
            <td className="py-1 pr-2">Total · {group.totals.shops} shop{group.totals.shops === 1 ? '' : 's'}</td>
            <td />
            <td className="py-1 pr-2 text-right font-mono">{money(group.totals.value)}</td>
            <td className="py-1 pr-2 text-right font-mono">{money(group.totals.toCollect)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
