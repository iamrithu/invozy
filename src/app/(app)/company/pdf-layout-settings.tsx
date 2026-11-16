'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Flag, Pencil, RotateCcw, Ruler, X } from 'lucide-react';
import { setPdfLayout } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { A4, contentHeightMm, contentWidthMm, DEFAULT_PDF_LAYOUT, normalizePdfLayout, PDF_LIMITS, type PdfLayout, type RowSpacing } from '@/lib/pdf-layout';
import { cn } from '@/lib/utils';

const SPACING: { id: RowSpacing; name: string; blurb: string; gap: number }[] = [
  { id: 'compact', name: 'Compact', blurb: 'More rows fit a page', gap: 3 },
  { id: 'normal', name: 'Normal', blurb: 'The standard spacing', gap: 5 },
  { id: 'relaxed', name: 'Relaxed', blurb: 'Airier, fewer rows a page', gap: 7 },
];

/** Company → PDF layout: the paper margins, item-row spacing, how many item
 * rows a page may hold, and the furniture on multi-page invoices. Its own
 * card (not part of the Company form) because it saves to the settings
 * table — see src/actions/settings.ts setPdfLayout. Every invoice template
 * (Modern, Classic, Clean) and every other PDF uses it. */
export function PdfLayoutSection({ id, value }: { id: string; value: PdfLayout }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PdfLayout>(value);
  const [pending, start] = useTransition();

  const set = <K extends keyof PdfLayout>(key: K, v: PdfLayout[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const isDefault = JSON.stringify(normalizePdfLayout(draft)) === JSON.stringify(DEFAULT_PDF_LAYOUT);

  function save(next: PdfLayout | null) {
    start(async () => {
      const res = await setPdfLayout(next);
      if (res.error || !res.layout) {
        toast.error(res.error ?? 'Could not save the PDF layout.');
        return;
      }
      setDraft(res.layout);
      setEditing(false);
      toast.success(next ? 'PDF layout saved — invoices redraw with it' : 'PDF layout reset to the defaults');
      router.refresh();
    });
  }

  return (
    <section id={id} className={cn('scroll-mt-[118px] rounded-xl2 border bg-surface shadow-card sm:scroll-mt-[128px] lg:scroll-mt-[80px]', editing ? 'border-brand' : 'border-line')}>
      <header className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
          <Ruler size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-extrabold text-ink sm:text-[15px]">PDF layout</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">Paper margins, row spacing and how many items a page holds — for the Modern, Classic and Clean invoices and every other PDF.</p>
        </div>
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            <Pencil size={13} /> Edit
          </Button>
        )}
      </header>

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(normalizePdfLayout(draft));
          }}
          className="px-4 py-4 sm:px-5"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_150px]">
            <div className="space-y-5">
              <Group title="Paper margins" note={`A4, in millimetres (${PDF_LIMITS.margin.min}–${PDF_LIMITS.margin.max}). The printable area is ${fmtMm(contentWidthMm(normalizePdfLayout(draft)))} × ${fmtMm(contentHeightMm(normalizePdfLayout(draft)))} mm.`}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MmInput label="Top" value={draft.marginTop} onChange={(v) => set('marginTop', v)} />
                  <MmInput label="Bottom" value={draft.marginBottom} onChange={(v) => set('marginBottom', v)} />
                  <MmInput label="Left" value={draft.marginLeft} onChange={(v) => set('marginLeft', v)} />
                  <MmInput label="Right" value={draft.marginRight} onChange={(v) => set('marginRight', v)} />
                </div>
              </Group>

              <Group title="Item row spacing" note="The padding above and below each product line.">
                <div role="radiogroup" aria-label="Item row spacing" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SPACING.map((o) => {
                    const active = draft.rowSpacing === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set('rowSpacing', o.id)}
                        className={cn(
                          'grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5 rounded-lg2 bg-surface text-left transition-colors',
                          active ? 'border-2 border-brand p-[7px]' : 'border border-line p-2 hover:border-ink-faint'
                        )}
                      >
                        <SpacingThumb gap={o.gap} />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-bold text-ink">{o.name}</span>
                          <span className="block text-[11px] leading-snug text-ink-soft">{o.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Group>

              <Group title="Items per page" note="Most rows a page may hold. A product name that wraps onto two lines takes more room, so a page can hold fewer — every page is measured before it prints.">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <CountInput
                    label="Pages without the totals"
                    value={draft.maxRowsPerPage}
                    min={PDF_LIMITS.rows.min}
                    max={PDF_LIMITS.rows.max}
                    onChange={(v) => set('maxRowsPerPage', v)}
                  />
                  <CountInput
                    label="Page with the totals"
                    value={draft.maxRowsWithTotals}
                    min={PDF_LIMITS.rowsWithTotals.min}
                    max={Math.min(PDF_LIMITS.rowsWithTotals.max, draft.maxRowsPerPage)}
                    onChange={(v) => set('maxRowsWithTotals', v)}
                  />
                  <CountInput
                    label="Rows kept with the totals"
                    value={draft.keepWithTotals}
                    min={PDF_LIMITS.keep.min}
                    max={PDF_LIMITS.keep.max}
                    onChange={(v) => set('keepWithTotals', v)}
                  />
                </div>
                <Hint>
                  With 0 rows kept, a last page of just the totals is fine — e.g. 20 items print as 20 on page 1, then the totals on page 2. Set 1–5 to always carry that many items over with the totals.
                </Hint>
              </Group>

              <Group title="Multi-page invoices">
                <div className="grid grid-cols-1 gap-2">
                  <ToggleRow
                    label="Carry the items total forward"
                    hint="“Carried forward” at the foot of each page and “Brought forward” at the top of the next."
                    checked={draft.carryForward}
                    onChange={(v) => set('carryForward', v)}
                  />
                  <ToggleRow
                    label="Totals at the bottom of the page"
                    hint="The totals — and the “continued” line on earlier pages — sit at the foot of every page, even a page with only the totals. Clean and Classic run their column lines down to them."
                    checked={draft.fillColumns}
                    onChange={(v) => set('fillColumns', v)}
                  />
                  <ToggleRow
                    label="Page footer"
                    hint="“This is a computer-generated document” and Page x of y at the bottom of every page."
                    checked={draft.pageFooter}
                    onChange={(v) => set('pageFooter', v)}
                  />
                </div>
              </Group>
            </div>

            <div className="hidden md:block">
              <div className="sticky top-[90px]">
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Preview</div>
                <PaperPreview layout={normalizePdfLayout(draft)} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" disabled={pending || isDefault} onClick={() => setDraft(DEFAULT_PDF_LAYOUT)}>
              <RotateCcw size={13} /> Defaults
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setDraft(value);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <Check size={13} /> {pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_110px] sm:px-5">
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <ViewRow label="Margins (top · right · bottom · left)" value={`${fmtMm(value.marginTop)} · ${fmtMm(value.marginRight)} · ${fmtMm(value.marginBottom)} · ${fmtMm(value.marginLeft)} mm`} mono />
              <ViewRow label="Item row spacing" value={SPACING.find((s) => s.id === value.rowSpacing)?.name ?? 'Normal'} />
              <ViewRow label="Items per page" value={`Up to ${value.maxRowsPerPage}`} />
              <ViewRow label="Items on the totals page" value={`Up to ${value.maxRowsWithTotals}`} />
              <ViewRow label="Rows kept with the totals" value={value.keepWithTotals === 0 ? 'None — totals may stand alone' : String(value.keepWithTotals)} />
            </dl>
            <div className="flex flex-wrap gap-1.5">
              <OnOff on={value.carryForward} label="Carry forward totals" />
              <OnOff on={value.fillColumns} label="Totals at the bottom" />
              <OnOff on={value.pageFooter} label="Page footer" />
            </div>
          </div>
          <div className="hidden sm:block">
            <PaperPreview layout={value} />
          </div>
        </div>
      )}
    </section>
  );
}

const fmtMm = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{title}</legend>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{note}</p>}
      <div className="mt-2 space-y-2">{children}</div>
    </fieldset>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-faint">
      <Flag size={12} className="mt-0.5 flex-shrink-0" /> <span>{children}</span>
    </p>
  );
}

const inputCls =
  'w-full min-w-0 rounded-sm2 border border-line bg-surface px-2 py-1.5 text-center font-mono text-[15px] font-extrabold text-ink outline-none focus:border-brand';

/** A number box that lets the field be cleared while typing and settles on
 * a valid number (clamped) when it loses focus. */
function NumberBox({ value, min, max, step, label, onChange }: { value: number; min: number; max: number; step: number; label: string; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={text ?? String(value)}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        const n = Number(text ?? value);
        onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n / step) * step)) : value);
        setText(null);
      }}
      className={inputCls}
    />
  );
}

function MmInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block rounded-lg2 border border-line bg-bg p-2">
      <span className="mb-1 block text-[11px] font-bold text-ink-soft">{label}</span>
      <span className="flex items-center gap-1.5">
        <NumberBox label={`${label} margin in mm`} value={value} min={PDF_LIMITS.margin.min} max={PDF_LIMITS.margin.max} step={0.5} onChange={onChange} />
        <span className="text-[11px] font-bold text-ink-faint">mm</span>
      </span>
    </label>
  );
}

function CountInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block rounded-lg2 border border-line bg-bg p-2">
      <span className="mb-1 block text-[11px] font-bold leading-snug text-ink-soft">{label}</span>
      <span className="flex items-center gap-1.5">
        <NumberBox label={label} value={value} min={min} max={max} step={1} onChange={onChange} />
        <span className="whitespace-nowrap text-[11px] font-bold text-ink-faint">rows</span>
      </span>
    </label>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg2 border border-line bg-bg p-3">
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold text-ink-soft">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{hint}</span>
      </span>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    </div>
  );
}

function ViewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-[13.5px] font-semibold text-ink', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

function OnOff({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-sm2 px-2 py-1 text-[11.5px] font-bold', on ? 'bg-green-soft text-green' : 'bg-surface-alt text-ink-faint')}>
      {on ? <Check size={12} /> : <X size={12} />} {label}
    </span>
  );
}

/** Three row lines at the chosen spacing — fixed paper colours, like the PDF. */
function SpacingThumb({ gap }: { gap: number }) {
  return (
    <span aria-hidden className="flex h-[34px] flex-col justify-center overflow-hidden rounded-[3px] border border-[#6b7280] bg-white px-1" style={{ gap }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="block h-[2px] rounded-full bg-[#9ca3af]" />
      ))}
    </span>
  );
}

/** A to-scale A4 sheet: the margins as the white border, the printable area
 * with a header, item rows (spacing follows the setting) and the totals. */
function PaperPreview({ layout }: { layout: PdfLayout }) {
  const pct = (mm: number, of: number) => `${(mm / of) * 100}%`;
  const gap = layout.rowSpacing === 'compact' ? 3 : layout.rowSpacing === 'relaxed' ? 6 : 4.5;
  return (
    <div aria-hidden className="relative w-full overflow-hidden rounded-[3px] border border-[#9ca3af] bg-white shadow-sm" style={{ aspectRatio: `${A4.widthMm} / ${A4.heightMm}` }}>
      <div
        className="absolute flex flex-col border border-dashed border-[#93c5fd] p-[3px]"
        style={{
          top: pct(layout.marginTop, A4.heightMm),
          bottom: pct(layout.marginBottom, A4.heightMm),
          left: pct(layout.marginLeft, A4.widthMm),
          right: pct(layout.marginRight, A4.widthMm),
        }}
      >
        <span className="block h-[14%] rounded-[2px] bg-[#e5e7eb]" />
        <span className="mt-[4%] flex flex-1 flex-col overflow-hidden" style={{ gap }}>
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className="block h-[2px] flex-none rounded-full bg-[#d1d5db]" />
          ))}
        </span>
        <span className="mt-[4%] block h-[16%] rounded-[2px] bg-[#e5e7eb]" />
      </div>
      {layout.pageFooter && <span className="absolute inset-x-[10%] bottom-[2%] block h-[2px] rounded-full bg-[#d1d5db]" />}
    </div>
  );
}
