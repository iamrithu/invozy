'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, RotateCcw } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { DASHBOARD_PRESETS, daysBetween, fyStart, quickRanges, resolveDashboardRange, spanText, type DashboardPreset } from '@/lib/dashboard-period';
import { cn } from '@/lib/utils';

export type PeriodPreset = DashboardPreset | 'all';
export type PeriodValue = { preset: PeriodPreset; from?: string; to?: string };

// IST calendar dates ("YYYY-MM-DD") ⇄ the local-midnight Dates the calendar
// works in. Only the Y/M/D parts cross over, so the browser's timezone
// never shifts a day.
const toDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const FIRST_MONTH = new Date(2015, 0, 1);

type Tab = 'day' | 'range' | 'year';

/** The app's date filter, shared by the Dashboard, Reports and Invoices: a
 * small button that says what's shown ("This month · 1–16 Nov 2026") and
 * opens one panel with every way to pick dates — periods (today … full
 * year, by Indian financial year; optionally All time), quick ranges
 * (yesterday, last 7 days…), and shadcn pickers for one day, a date range
 * or a whole year. Periods and quick ranges apply on click; a range applies
 * with its button. "Reset to today" sits in the panel, and as an icon beside
 * the button whenever the dates aren't today already. */
export function PeriodPicker({
  value,
  onChange,
  today,
  allowAll = false,
  compareLabel,
  align = 'start',
  className,
}: {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
  today: string;
  allowAll?: boolean;
  /** "the same days of October (1–16 Oct 2026)" — shown in the panel. */
  compareLabel?: string | null;
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const resolved = value.preset === 'all' ? null : resolveDashboardRange({ period: value.preset, from: value.from, to: value.to }, today);
  const custom = value.preset === 'custom' && resolved?.preset === 'custom' ? resolved : null;
  const kind: Tab | null = !custom ? null : custom.from === custom.to ? 'day' : isWholeYear(custom.from, custom.to, today) ? 'year' : 'range';
  const [tab, setTab] = useState<Tab>(kind ?? 'range');
  const [draft, setDraft] = useState<DateRange | undefined>();
  const wide = useWide();
  const quick = quickRanges(today);
  const presets: { id: PeriodPreset; label: string }[] = [...(allowAll ? [{ id: 'all' as const, label: 'All time' }] : []), ...DASHBOARD_PRESETS];

  const name =
    value.preset === 'all'
      ? 'All time'
      : custom
        ? kind === 'year'
          ? custom.word
          : quick.find((q) => q.from === custom.from && q.to === custom.to)?.label ?? (kind === 'day' ? 'One day' : 'Custom dates')
        : DASHBOARD_PRESETS.find((p) => p.id === value.preset)?.label ?? 'Dates';

  function pick(next: PeriodValue) {
    onChange(next);
    setOpen(false);
  }

  const dFrom = draft?.from ? toIso(draft.from) : undefined;
  const dTo = draft?.to ? toIso(draft.to) : dFrom;
  const end = toDate(custom?.to ?? today);
  const openingMonth = new Date(end.getFullYear(), end.getMonth() - (wide ? 1 : 0), 1);

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 print:hidden', className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) {
            setTab(kind ?? 'range');
            setDraft(custom && kind === 'range' ? { from: toDate(custom.from), to: toDate(custom.to) } : undefined);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            title={resolved ? `${resolved.dates}${compareLabel ? ` · compared with ${compareLabel}` : ''}` : 'All time'}
            className="flex h-9 min-w-0 max-w-full items-center gap-2 rounded-sm2 border border-line bg-surface px-3 text-[12.5px] font-bold text-ink-body transition-colors hover:border-brand/50 hover:text-ink data-[state=open]:border-brand"
          >
            <CalendarDays size={15} className="flex-shrink-0 text-brand" />
            <span className="flex-shrink-0">{name}</span>
            {resolved && <span className="truncate font-mono text-[12px] font-semibold text-ink-soft">· {resolved.dates}</span>}
            <ChevronDown size={14} className="flex-shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-auto p-0">
          <div className="flex flex-col sm:flex-row">
            <div className="border-b border-line p-2 sm:w-[172px] sm:border-b-0 sm:border-r">
              <GroupLabel>Periods</GroupLabel>
              <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-1">
                {presets.map((p) => (
                  <ListButton key={p.id} active={value.preset === p.id} onClick={() => pick({ preset: p.id })}>
                    {p.label}
                  </ListButton>
                ))}
              </div>
              <GroupLabel className="mt-2">Quick ranges</GroupLabel>
              <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-1">
                {quick.map((q) => (
                  <ListButton key={q.label} active={!!custom && custom.from === q.from && custom.to === q.to} onClick={() => pick({ preset: 'custom', from: q.from, to: q.to })}>
                    {q.label}
                  </ListButton>
                ))}
              </div>
            </div>

            <div className="min-w-0 p-2">
              <div role="tablist" aria-label="Pick dates by" className="mb-2 grid grid-cols-3 gap-1 rounded-lg2 bg-bg p-1">
                {(
                  [
                    ['day', 'Pick a day'],
                    ['range', 'Date range'],
                    ['year', 'Year'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn('h-7 rounded-[5px] px-2 text-[12px] font-bold transition-colors', tab === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'day' && (
                <Calendar
                  mode="single"
                  captionLayout="dropdown"
                  selected={kind === 'day' && custom ? toDate(custom.from) : undefined}
                  defaultMonth={toDate(kind === 'day' && custom ? custom.from : today)}
                  startMonth={FIRST_MONTH}
                  endMonth={toDate(today)}
                  disabled={{ after: toDate(today) }}
                  onSelect={(d) => d && pick({ preset: 'custom', from: toIso(d), to: toIso(d) })}
                />
              )}

              {tab === 'range' && (
                <>
                  <Calendar
                    mode="range"
                    numberOfMonths={wide ? 2 : 1}
                    captionLayout="dropdown"
                    selected={draft}
                    onSelect={setDraft}
                    defaultMonth={openingMonth}
                    startMonth={FIRST_MONTH}
                    endMonth={toDate(today)}
                    disabled={{ after: toDate(today) }}
                  />
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-line px-1 pt-2">
                    <span className="text-[12px] text-ink-soft">
                      {dFrom && dTo ? (
                        <>
                          <b className="font-mono text-ink">{spanText(dFrom, dTo)}</b> · {daysBetween(dFrom, dTo) + 1} day{dFrom === dTo ? '' : 's'}
                        </>
                      ) : (
                        'Pick the first day, then the last'
                      )}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!dFrom || !dTo}
                      onClick={() => dFrom && dTo && pick({ preset: 'custom', from: dFrom, to: dTo })}
                    >
                      Show these dates
                    </Button>
                  </div>
                </>
              )}

              {tab === 'year' && <YearGrid today={today} selectedFrom={kind === 'year' ? custom?.from : undefined} onPick={pick} />}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
            <span className="min-w-0 text-[11.5px] leading-snug text-ink-faint">
              {resolved ? (
                <>
                  Showing <b className="font-mono text-ink">{resolved.dates}</b>
                  {compareLabel ? <> · compared with {compareLabel}</> : null}
                </>
              ) : (
                'Showing every invoice, from the first one'
              )}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => pick({ preset: 'today' })} disabled={value.preset === 'today'}>
              <RotateCcw size={12} /> Reset to today
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {value.preset !== 'today' && (
        <button
          type="button"
          onClick={() => onChange({ preset: 'today' })}
          title="Reset to today"
          aria-label="Reset dates to today"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 border border-line bg-surface text-ink-soft transition-colors hover:border-brand/50 hover:text-ink"
        >
          <RotateCcw size={14} />
        </button>
      )}
    </div>
  );
}

function GroupLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-2 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint', className)}>{children}</div>;
}

function ListButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-sm2 px-2 py-1.5 text-left text-[12.5px] font-semibold transition-colors',
        active ? 'bg-ink text-surface' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}

/** A whole year — financial (April–March, as GST books run) or calendar —
 * from the last six. This year runs up to today; this FY is the Full year
 * period itself. */
function YearGrid({ today, selectedFrom, onPick }: { today: string; selectedFrom?: string; onPick: (v: PeriodValue) => void }) {
  const [mode, setMode] = useState<'fy' | 'cal'>(selectedFrom?.slice(5) === '01-01' ? 'cal' : 'fy');
  const currentFy = Number(fyStart(today).slice(0, 4));
  const currentYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 6 }, (_, i) => (mode === 'fy' ? currentFy : currentYear) - i);

  function choose(y: number) {
    if (mode === 'fy') onPick(y === currentFy ? { preset: 'year' } : { preset: 'custom', from: `${y}-04-01`, to: `${y + 1}-03-31` });
    else onPick({ preset: 'custom', from: `${y}-01-01`, to: y === currentYear ? today : `${y}-12-31` });
  }

  return (
    <div className="w-[260px] max-w-full">
      <div role="group" aria-label="Kind of year" className="mb-2 grid grid-cols-2 gap-1 rounded-lg2 border border-line p-1">
        {(
          [
            ['fy', 'Financial year'],
            ['cal', 'Calendar year'],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            className={cn('h-7 rounded-[5px] text-[11.5px] font-bold transition-colors', mode === id ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink')}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {years.map((y) => {
          const from = mode === 'fy' ? `${y}-04-01` : `${y}-01-01`;
          const selected = selectedFrom === from;
          const current = mode === 'fy' ? y === currentFy : y === currentYear;
          return (
            <button
              key={y}
              type="button"
              onClick={() => choose(y)}
              aria-pressed={selected}
              className={cn('flex flex-col items-start rounded-sm2 border px-2.5 py-2 text-left transition-colors', selected ? 'border-ink bg-ink' : 'border-line hover:border-brand/50')}
            >
              <span className={cn('font-mono text-[13px] font-bold', selected ? 'text-surface' : 'text-ink')}>
                {mode === 'fy' ? `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}` : y}
              </span>
              <span className={cn('text-[10.5px]', selected ? 'text-surface/80' : 'text-ink-faint')}>
                {current ? 'So far' : mode === 'fy' ? `Apr ${y} – Mar ${y + 1}` : 'Jan – Dec'}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] leading-snug text-ink-faint">{mode === 'fy' ? 'April to March, as your GST returns and books run.' : 'January to December.'}</p>
    </div>
  );
}

function isWholeYear(from: string, to: string, today: string): boolean {
  const y = Number(from.slice(0, 4));
  if (from.slice(5) === '04-01' && to === `${y + 1}-03-31`) return true;
  if (from.slice(5) === '01-01' && (to === `${y}-12-31` || (to === today && today.slice(0, 4) === from.slice(0, 4)))) return true;
  return false;
}

/** ≥640px — two months side by side in the range calendar. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 640px)');
    const update = () => setWide(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, []);
  return wide;
}

/** A PeriodValue from URL params (`period`, `from`, `to`). */
export function periodFromParams(get: (k: string) => string | null | undefined, fallback: PeriodPreset): PeriodValue {
  const p = get('period');
  const known = p === 'all' || p === 'custom' || DASHBOARD_PRESETS.some((x) => x.id === p);
  if (!known) return { preset: fallback };
  if (p === 'custom') return { preset: 'custom', from: get('from') ?? undefined, to: get('to') ?? undefined };
  return { preset: p as PeriodPreset };
}

/** The URL params for a PeriodValue, onto `base` (other params kept).
 * `defaultPreset` is left out of the URL. */
export function periodToParams(v: PeriodValue, base: URLSearchParams, defaultPreset: PeriodPreset): URLSearchParams {
  const params = new URLSearchParams(base.toString());
  params.delete('period');
  params.delete('from');
  params.delete('to');
  if (v.preset !== defaultPreset) params.set('period', v.preset);
  if (v.preset === 'custom' && v.from && v.to) {
    params.set('from', v.from);
    params.set('to', v.to);
  }
  return params;
}
