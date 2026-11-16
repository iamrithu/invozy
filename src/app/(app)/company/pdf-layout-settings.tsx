'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, FileText, Flag, Pencil, RotateCcw, X } from 'lucide-react';
import { savePdfSettings } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { A4, contentHeightMm, contentWidthMm, DEFAULT_PDF_LAYOUT, LOGO_BASE_PX, logoPx, normalizePdfLayout, PDF_LIMITS, type PdfLayout, type RowSpacing } from '@/lib/pdf-layout';
import type { InvoiceTemplateName } from '@/lib/invoice-template';
import type { PdfItemRows } from '@/lib/settings';
import { cn } from '@/lib/utils';

const TEMPLATES: { id: InvoiceTemplateName; name: string; blurb: string }[] = [
  { id: 'MODERN', name: 'Modern', blurb: 'Colour accent, rounded card. Best for simple retail bills.' },
  { id: 'CLASSIC', name: 'Classic', blurb: 'Tally-style GST invoice with IRN/QR, HSN summary and e-Way Bill page.' },
  { id: 'CLEAN', name: 'Clean', blurb: 'Centered letterhead, logo and QR the same size, thin even lines, one font weight.' },
];

const ROW_STYLES: { id: PdfItemRows; name: string; blurb: string }[] = [
  { id: 'none', name: 'Column lines only', blurb: 'Clean, no line between products.' },
  { id: 'lines', name: 'Line between rows', blurb: 'A thin rule under each product.' },
  { id: 'zebra', name: 'Light shading', blurb: 'Every other row lightly shaded.' },
];

const SPACING: { id: RowSpacing; name: string; blurb: string; gap: number }[] = [
  { id: 'compact', name: 'Compact', blurb: 'More rows fit a page', gap: 3 },
  { id: 'normal', name: 'Normal', blurb: 'The standard spacing', gap: 5 },
  { id: 'relaxed', name: 'Relaxed', blurb: 'Airier, fewer rows a page', gap: 7 },
];

/** Company → Invoice template & PDF layout: everything about how the PDFs
 * look in one card — the invoice template, how product rows are separated,
 * the paper margins, item-row spacing, how many rows a page may hold, and
 * the furniture on multi-page invoices. Saved together by
 * src/actions/settings.ts savePdfSettings. */
export function PdfSettingsSection({
  id,
  template,
  rows,
  layout: value,
  logoUrl,
  companyName,
}: {
  id: string;
  template: InvoiceTemplateName;
  rows: PdfItemRows;
  layout: PdfLayout;
  logoUrl?: string | null;
  companyName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PdfLayout>(value);
  const [draftTemplate, setDraftTemplate] = useState<InvoiceTemplateName>(template);
  const [draftRows, setDraftRows] = useState<PdfItemRows>(rows);
  const [pending, start] = useTransition();
  const current = TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[0];

  const set = <K extends keyof PdfLayout>(key: K, v: PdfLayout[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const isDefault = JSON.stringify(normalizePdfLayout(draft)) === JSON.stringify(DEFAULT_PDF_LAYOUT);

  function startEditing() {
    setDraft(value);
    setDraftTemplate(template);
    setDraftRows(rows);
    setEditing(true);
  }

  function save() {
    start(async () => {
      const res = await savePdfSettings({ invoiceTemplate: draftTemplate, pdfItemRows: draftRows, layout: normalizePdfLayout(draft) });
      if (res.error || !res.layout) {
        toast.error(res.error ?? 'Could not save the PDF settings.');
        return;
      }
      setDraft(res.layout);
      setEditing(false);
      toast.success('Invoice template & PDF layout saved — invoices redraw with it');
      router.refresh();
    });
  }

  return (
    <section id={id} className={cn('scroll-mt-[118px] rounded-xl2 border bg-surface shadow-card sm:scroll-mt-[128px] lg:scroll-mt-[80px]', editing ? 'border-brand' : 'border-line')}>
      <header className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
          <FileText size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-extrabold text-ink sm:text-[15px]">Invoice template &amp; PDF layout</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">How every invoice PDF looks: the template, product rows, paper margins and how many items a page holds.</p>
        </div>
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={startEditing}
          >
            <Pencil size={13} /> Edit
          </Button>
        )}
      </header>

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="px-4 py-4 sm:px-5"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_236px]">
            <div className="space-y-5">
              <Group title="Invoice template" note="Applies to every invoice PDF, including saved ones — each is redrawn the next time it's opened.">
                <div role="radiogroup" aria-label="Invoice template" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {TEMPLATES.map((t) => {
                    const active = draftTemplate === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setDraftTemplate(t.id)}
                        // 2px border when picked, padding trimmed by the same 1px so the card doesn't shift.
                        className={cn('grid content-start gap-2 rounded-lg2 bg-surface text-left transition-colors', active ? 'border-2 border-brand p-[9px]' : 'border border-line p-2.5 hover:border-ink-faint')}
                      >
                        <TemplateThumb id={t.id} />
                        <span className="flex items-center justify-between gap-2 text-[13px] font-bold text-ink">
                          {t.name}
                          {active && <span className="rounded-sm2 bg-brand-light px-1.5 py-0.5 text-[10.5px] font-bold text-brand-dark">Selected</span>}
                        </span>
                        <span className="text-[11.5px] leading-snug text-ink-soft">{t.blurb}</span>
                      </button>
                    );
                  })}
                </div>
              </Group>

              <Group title="Logo size" note="100% is each template's standard size. A bigger logo makes the letterhead taller, so the first page holds a row or two fewer.">
                <div className="grid grid-cols-1 items-center gap-4 rounded-lg2 border border-line bg-bg p-3 sm:grid-cols-[minmax(0,1fr)_172px]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        aria-label="Logo size"
                        min={PDF_LIMITS.logoScale.min}
                        max={PDF_LIMITS.logoScale.max}
                        step={5}
                        value={draft.logoScale}
                        onChange={(e) => set('logoScale', Number(e.target.value))}
                        className="h-2 w-full min-w-0 cursor-pointer accent-brand"
                      />
                      <span className="w-14 flex-none text-right font-mono text-[15px] font-extrabold text-ink">{draft.logoScale}%</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {LOGO_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => set('logoScale', p.value)}
                          className={cn(
                            'rounded-sm2 border px-2.5 py-1 text-[12px] font-bold transition-colors',
                            draft.logoScale === p.value ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft hover:border-ink-faint'
                          )}
                        >
                          {p.label} · {p.value}%
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-ink-faint">
                      On the {TEMPLATES.find((t) => t.id === draftTemplate)?.name ?? 'invoice'} template: {fmtMm(pxMm(logoPx(LOGO_BASE_PX[draftTemplate], draft)))} mm square. Receipts, statements and credit notes use the Clean size.
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <LogoPreview logoUrl={logoUrl} px={logoPx(LOGO_BASE_PX[draftTemplate], draft)} />
                  </div>
                </div>
                <div className="flex justify-center md:hidden">
                  <InvoiceSketch width={220} layout={normalizePdfLayout(draft)} template={draftTemplate} rows={draftRows} logoUrl={logoUrl} companyName={companyName} />
                </div>
              </Group>

              <Group title="Product rows" note="How products are separated on the Clean invoice, credit notes, receipts and statements.">
                <div role="radiogroup" aria-label="Product rows" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {ROW_STYLES.map((o) => {
                    const active = draftRows === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setDraftRows(o.id)}
                        className={cn(
                          'grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2.5 rounded-lg2 bg-surface text-left transition-colors',
                          active ? 'border-2 border-brand p-[7px]' : 'border border-line p-2 hover:border-ink-faint'
                        )}
                      >
                        <RowsThumb id={o.id} />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-bold text-ink">{o.name}</span>
                          <span className="block text-[11px] leading-snug text-ink-soft">{o.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Group>

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
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Live preview</div>
                <InvoiceSketch width={236} layout={normalizePdfLayout(draft)} template={draftTemplate} rows={draftRows} logoUrl={logoUrl} companyName={companyName} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" disabled={pending || isDefault} onClick={() => setDraft(DEFAULT_PDF_LAYOUT)} title="Margins, spacing and rows per page back to the defaults (the template and row style stay)">
              <RotateCcw size={13} /> Default layout
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
        <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_160px] sm:px-5">
          <div className="space-y-4">
            <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
              <TemplateThumb id={current.id} />
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Invoice template</div>
                <div className="mt-0.5 text-[13.5px] font-semibold text-ink">{current.name}</div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">{current.blurb}</div>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <ViewRow label="Product rows" value={ROW_STYLES.find((r) => r.id === rows)?.name ?? 'Column lines only'} />
              <ViewRow label="Logo size" value={`${value.logoScale}%${value.logoScale === 100 ? ' (standard)' : ''}`} />
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
            <InvoiceSketch width={160} layout={value} template={template} rows={rows} logoUrl={logoUrl} companyName={companyName} caption={false} />
          </div>
        </div>
      )}
    </section>
  );
}

const fmtMm = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pxMm = (px: number) => Math.round((px * 25.4) / 96 * 2) / 2;

const LOGO_PRESETS = [
  { label: 'Small', value: 75 },
  { label: 'Standard', value: 100 },
  { label: 'Large', value: 130 },
  { label: 'Extra large', value: 160 },
];

/** The company's logo at the size it prints (CSS px at 96dpi match the
 * PDF), on white paper like the invoice. */
function LogoPreview({ logoUrl, px }: { logoUrl?: string | null; px: number }) {
  return (
    <div className="grid justify-items-center gap-1.5">
      <div className="flex h-[160px] w-[172px] items-center justify-center overflow-hidden rounded-md2 border border-line bg-white">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Your logo at the chosen size" className="block object-contain outline outline-1 outline-offset-0 outline-dashed outline-[#93c5fd]" style={{ width: px, height: px }} />
        ) : (
          <span className="flex items-center justify-center rounded-[3px] border border-dashed border-[#9ca3af] bg-[#f3f4f6] text-center text-[10px] leading-tight text-[#6b7280]" style={{ width: px, height: px }}>
            Logo
          </span>
        )}
      </div>
      <span className="text-[10.5px] text-ink-faint">{logoUrl ? 'Actual size on paper' : 'No logo yet — add one at the top of this page'}</span>
    </div>
  );
}

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

// Typical section heights of a one-page invoice per template, in mm, as
// measured on printed invoices (print-pagination.tsx, data-layout-mm) —
// enough for a to-scale sketch. Real pages are measured when they print.
const SKETCH: Record<InvoiceTemplateName, { header: number; textBlock: number; buyer: number; thead: number; row: number; closing: number }> = {
  CLEAN: { header: 60, textBlock: 31, buyer: 31, thead: 7, row: 7.2, closing: 57 },
  CLASSIC: { header: 41, textBlock: 24, buyer: 26, thead: 12, row: 6.7, closing: 81 },
  MODERN: { header: 37, textBlock: 26, buyer: 33, thead: 12, row: 8.2, closing: 89 },
};
/** Row height change per spacing step, mm (2px / 5px / 9px cell padding). */
const SPACING_MM: Record<RowSpacing, number> = { compact: -1.6, normal: 0, relaxed: 2.1 };
const INK = '#111827';
const RULE = '#9ca3af';
const BAR = '#d1d5db';
const FILL = '#f3f4f6';

/** A to-scale sketch of a one-page invoice with these settings, redrawn as
 * anything changes: the margins, the chosen template's letterhead with the
 * real logo at its chosen size, as many item rows as the totals page allows
 * (spacing and row style as set), the totals (at the foot when that's on)
 * and the page footer. Paper colours, like the PDF, in either app theme. */
function InvoiceSketch({
  width,
  layout,
  template,
  rows,
  logoUrl,
  companyName,
  caption = true,
}: {
  width: number;
  layout: PdfLayout;
  template: InvoiceTemplateName;
  rows: PdfItemRows;
  logoUrl?: string | null;
  companyName: string;
  caption?: boolean;
}) {
  const k = width / A4.widthMm; // px per mm
  const mm = (v: number) => v * k;
  const s = SKETCH[template];
  const logoMm = pxMm(logoPx(LOGO_BASE_PX[template], layout));
  // The letterhead only grows once the logo is taller than its text block.
  const headerMm = s.header + Math.max(0, logoMm - s.textBlock);
  const rowMm = s.row + SPACING_MM[layout.rowSpacing];
  const room = contentHeightMm(layout) - 7 - headerMm - s.buyer - s.thead - s.closing;
  const count = Math.max(0, Math.min(layout.maxRowsWithTotals, Math.floor(room / rowMm)));
  const framed = template !== 'MODERN';
  const bar = (w: number | string, h = 1.5, c = BAR) => <span className="block flex-none rounded-full" style={{ width: w, height: Math.max(1, mm(h)), background: c }} />;
  const name = (
    <span className="block max-w-full truncate font-bold" style={{ color: INK, fontSize: Math.max(4.5, mm(template === 'CLEAN' ? 5.2 : 4.6)), lineHeight: 1.2 }}>
      {companyName}
    </span>
  );
  const logo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" className={cn('block flex-none object-contain', template === 'MODERN' && 'rounded-[2px] border border-[#e5e7eb]')} style={{ width: mm(logoMm), height: mm(logoMm) }} />
  ) : (
    <span className="block flex-none rounded-[2px] border border-dashed" style={{ width: mm(logoMm), height: mm(logoMm), borderColor: RULE, background: FILL }} />
  );

  return (
    <div aria-hidden="true" className="grid justify-items-center gap-1.5">
      <div className="relative overflow-hidden rounded-[3px] border border-[#9ca3af] bg-white shadow-sm" style={{ width, height: mm(A4.heightMm) }}>
        <div
          className="absolute flex flex-col overflow-hidden"
          style={{ top: mm(layout.marginTop), bottom: mm(layout.marginBottom), left: mm(layout.marginLeft), right: mm(layout.marginRight), border: framed ? `1px solid ${RULE}` : undefined }}
        >
          {/* Letterhead */}
          {template === 'CLEAN' && (
            <div className="flex flex-none flex-col" style={{ height: mm(headerMm) }}>
              <div className="flex flex-none items-center justify-center" style={{ height: mm(7) }}>
                {bar('30%', 1.4, '#6b7280')}
              </div>
              <div className="grid min-h-0 flex-1 items-center border-t" style={{ borderColor: RULE, gridTemplateColumns: 'minmax(0,1fr) 50% minmax(0,1fr)', gap: mm(3), padding: `0 ${mm(3)}px` }}>
                <div className="justify-self-start">{logo}</div>
                <div className="grid min-w-0 justify-items-center" style={{ gap: mm(1.3) }}>
                  {name}
                  {bar('92%')}
                  {bar('70%')}
                  {bar('52%')}
                  {bar('60%')}
                </div>
                <span
                  className="block justify-self-end"
                  style={{ width: mm(23.3), height: mm(23.3), background: `repeating-conic-gradient(#4b5563 0 25%, #ffffff 0 50%) 0 0 / ${mm(3.3)}px ${mm(3.3)}px` }}
                />
              </div>
              <div className="grid flex-none grid-cols-4 border-t" style={{ height: mm(9), borderColor: RULE }}>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="grid content-center" style={{ gap: mm(1), paddingLeft: mm(2), borderLeft: i > 0 ? `1px solid ${RULE}` : undefined }}>
                    {bar('45%', 1.1, BAR)}
                    {bar('62%', 1.5, '#6b7280')}
                  </span>
                ))}
              </div>
            </div>
          )}
          {template === 'CLASSIC' && (
            <div className="flex flex-none flex-col border-b" style={{ height: mm(headerMm), borderColor: RULE }}>
              <div className="flex flex-none items-center justify-center border-b" style={{ height: mm(8), background: FILL, borderColor: RULE }}>
                {bar('28%', 1.6, '#4b5563')}
              </div>
              <div className="flex min-h-0 flex-1 items-start justify-between" style={{ padding: mm(2.5), gap: mm(3) }}>
                <div className="flex min-w-0 items-start" style={{ gap: mm(2.5) }}>
                  {logo}
                  <div className="grid min-w-0" style={{ gap: mm(1.3), width: mm(70) }}>
                    {name}
                    {bar('90%')}
                    {bar('75%')}
                    {bar('60%')}
                  </div>
                </div>
                <div className="grid flex-none justify-items-end" style={{ gap: mm(1.3) }}>
                  {bar(mm(16))}
                  {bar(mm(26), 2.4, '#374151')}
                  {bar(mm(18))}
                </div>
              </div>
            </div>
          )}
          {template === 'MODERN' && (
            <div className="flex flex-none items-start justify-between" style={{ height: mm(headerMm), borderBottom: `2px solid ${INK}`, gap: mm(3) }}>
              <div className="flex min-w-0 items-start" style={{ gap: mm(3) }}>
                {logo}
                <div className="grid min-w-0" style={{ gap: mm(1.3), width: mm(70) }}>
                  {name}
                  {bar('85%')}
                  {bar('70%')}
                  {bar('55%')}
                </div>
              </div>
              <div className="grid flex-none content-start justify-items-end rounded-[2px] border" style={{ borderColor: INK, padding: mm(2), gap: mm(1.3) }}>
                {bar(mm(14))}
                {bar(mm(24), 2.4, INK)}
                {bar(mm(18))}
              </div>
            </div>
          )}

          {/* Buyer */}
          <div className={cn('grid flex-none content-start', framed && 'border-b')} style={{ height: mm(s.buyer), borderColor: RULE, padding: mm(2.5), gap: mm(1.4) }}>
            {bar('16%', 1.1)}
            {bar('34%', 1.8, '#6b7280')}
            {bar('50%')}
            {bar('30%')}
          </div>

          {/* Items: header, rows, and — with "totals at the bottom" — the column lines run on down to the totals */}
          <div className={cn('relative flex flex-col', layout.fillColumns ? 'min-h-0 flex-1' : 'flex-none')} style={{ border: framed ? undefined : `1px solid ${INK}` }}>
            <div className="flex-none" style={{ height: mm(s.thead), background: FILL, borderBottom: `1px solid ${RULE}` }} />
            {Array.from({ length: count }, (_, i) => (
              <div
                key={i}
                className="flex flex-none items-center"
                style={{
                  height: mm(rowMm),
                  background: template === 'CLEAN' && rows === 'zebra' && i % 2 === 1 ? '#eceef1' : undefined,
                  borderTop: i > 0 && (template !== 'CLEAN' || rows === 'lines') ? `1px solid ${template === 'CLEAN' ? RULE : BAR}` : undefined,
                }}
              >
                <span className="block rounded-full" style={{ marginLeft: '11%', width: `${28 + ((i * 37) % 22)}%`, height: Math.max(1, mm(1.3)), background: BAR }} />
              </div>
            ))}
            {[9, 57, 71, 85].map((x) => (
              <span key={x} className="absolute bottom-0 top-0 w-px" style={{ left: `${x}%`, background: template === 'MODERN' ? INK : RULE }} />
            ))}
          </div>

          {/* Totals */}
          <div className={cn('grid flex-none grid-cols-[minmax(0,1fr)_40%]', framed && 'border-t')} style={{ height: mm(s.closing), borderColor: RULE, marginTop: framed ? 0 : mm(3) }}>
            <div className="grid content-start" style={{ padding: mm(2.5), gap: mm(1.6) }}>
              {bar('40%', 1.1)}
              {bar('70%')}
              {bar('55%')}
              {bar('62%')}
            </div>
            <div className="grid content-start border-l" style={{ borderColor: RULE, padding: mm(2.5), gap: mm(1.8) }}>
              {bar('80%')}
              {bar('80%')}
              {bar('80%')}
              <span className="block border-t" style={{ borderColor: RULE, paddingTop: mm(1.5) }}>
                {bar('90%', 2.4, INK)}
              </span>
            </div>
          </div>
          {!layout.fillColumns && <div className="flex-1" />}
        </div>

        {layout.pageFooter && (
          <div className="absolute flex items-center justify-between" style={{ left: mm(layout.marginLeft), right: mm(layout.marginRight), bottom: mm(layout.marginBottom / 2 - 0.8) }}>
            {bar('34%', 1.1)}
            {bar('14%', 1.1)}
          </div>
        )}
      </div>
      {caption && (
        <span className="max-w-full text-center text-[10.5px] leading-snug text-ink-faint">
          A one-page invoice: {count} item{count === 1 ? '' : 's'} + totals. Real pages are measured when they print.
        </span>
      )}
    </div>
  );
}

/** A tiny schematic of each template's first page — always on white paper,
 * like the invoice itself, whatever the app theme. */
function TemplateThumb({ id }: { id: InvoiceTemplateName }) {
  // tailwind-merge (cn) so a bar's own height/colour reliably replaces the
  // default — plain string concatenation leaves that to CSS order.
  const bar = (cls: string) => cn('block h-1.5 rounded-[2px] bg-[#d1d5db]', cls);
  return (
    <span aria-hidden="true" className="grid h-[84px] content-start gap-1.5 overflow-hidden rounded-md2 border border-line bg-white p-2.5">
      {id === 'MODERN' && (
        <>
          <span className={bar('h-2.5 w-[40%] bg-brand')} />
          <span className={bar('w-[70%]')} />
          <span className={bar('w-[55%]')} />
          <span className={bar('h-[26px] bg-[#f1f5f9]')} />
        </>
      )}
      {id === 'CLASSIC' && (
        <>
          <span className={bar('h-2 bg-[#9ca3af]')} />
          <span className="flex gap-1.5">
            <span className={bar('h-[18px] w-[18px] flex-none')} />
            <span className="grid flex-1 content-start gap-1">
              <span className={bar('w-[60%]')} />
              <span className={bar('w-[90%]')} />
            </span>
          </span>
          <span className={bar('h-[26px] bg-[#e5e7eb]')} />
        </>
      )}
      {id === 'CLEAN' && (
        <>
          <span className={bar('mx-auto w-[40%]')} />
          <span className="grid grid-cols-[22px_1fr_22px] items-center gap-1.5">
            <span className={bar('h-[22px] bg-brand opacity-70')} />
            <span className="grid justify-items-center gap-[3px]">
              <span className={bar('h-[7px] w-[70%] bg-[#6b7280]')} />
              <span className={bar('w-[90%]')} />
              <span className={bar('w-[60%]')} />
            </span>
            <span className={bar('h-[22px] bg-[#1c1c1c]')} />
          </span>
          <span className={bar('h-6 rounded-none border border-[#9ca3af] bg-[#f3f4f6]')} />
        </>
      )}
    </span>
  );
}

/** A tiny paper table showing the row style — fixed paper colours, like the PDF itself. */
function RowsThumb({ id }: { id: PdfItemRows }) {
  return (
    <span aria-hidden className="block overflow-hidden rounded-[3px] border border-[#6b7280] bg-white">
      <span className="block h-[7px] border-b border-[#6b7280] bg-[#f3f4f6]" />
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'grid h-[7px] grid-cols-[1fr_2.4fr_1fr]',
            id === 'lines' && i > 0 && 'border-t border-[#6b7280]',
            id === 'zebra' && i % 2 === 1 && 'bg-[#e9ebee]'
          )}
        >
          <span />
          <span className="border-l border-[#6b7280]" />
          <span className="border-l border-[#6b7280]" />
        </span>
      ))}
    </span>
  );
}
