'use client';

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

/** The one layout every create/edit form uses (Product, Customer, Supplier,
 * Stock in, Adjust stock, Team login), top to bottom:
 *   header       icon · title · subtitle · optional switch · close
 *   section row  one chip per section — tap to jump; ticks when done, red
 *                when something in it needs fixing
 *   preview      the record as it will look where it's used, live
 *   sections     numbered, each on a 6-column grid (FormGrid/FormField)
 *   footer       Delete (edit) · hint or "N to fix" · Cancel · Save & add
 *                another (create) · Save
 * A 45% right sheet on tablets and up; full screen on a phone, with 44px
 * fields and 16px text (globals.css `.form-kit`). ⌘/Ctrl+Enter saves. */

export type FormSectionMeta = { id: string; label: string; done?: boolean; issues?: number };

/** Every named string field of the form, as last typed — feeds the live
 * preview and section ticks without making each input controlled. */
export type FormValues = Record<string, string>;

/** Which footer button sent the form: "Save & add another" is `another`.
 * ⌘/Ctrl+Enter (no submitter) is a plain save. */
export function submitIntent(e: React.FormEvent<HTMLFormElement>): 'save' | 'another' {
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  return submitter?.value === 'another' ? 'another' : 'save';
}

function readForm(form: HTMLFormElement): FormValues {
  const values: FormValues = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === 'string' && !(k in values)) values[k] = v;
  });
  return values;
}

type FrameProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  /** Right side of the header, before the close button — e.g. an Active switch. */
  headerAside?: React.ReactNode;
  children: React.ReactNode;
};

/** Sheet + header only — for a step that isn't a form (e.g. the "share
 * these login details" screen after creating a login). */
export function FormSheetFrame({ open, onOpenChange, icon, title, subtitle, headerAside, children }: FrameProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent hideClose className="form-kit">
        <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line pl-4 pr-3 sm:h-16 sm:px-[22px]">
          <span className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark sm:flex">{icon}</span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-[17px] font-bold sm:text-[16px]">{title}</SheetTitle>
            <SheetDescription className="truncate text-[11.5px] text-ink-faint">{subtitle}</SheetDescription>
          </div>
          {headerAside}
          <SheetClose className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-sm2 text-ink-soft transition-colors hover:bg-surface-alt hover:text-ink sm:h-8 sm:w-8 sm:bg-surface-alt">
            <X size={16} />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}

type FormSheetProps = Omit<FrameProps, 'children'> & {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /** Change it to start a fresh, empty form (after "Save & add another"). */
  formKey?: string | number;
  /** Called with every field's current text on open and after each edit. */
  onValues?: (values: FormValues) => void;
  sections?: FormSectionMeta[];
  /** Overrides the right side of the section row ("2 of 4 done"). */
  progress?: string;
  preview?: { caption: string; content: React.ReactNode };
  submitLabel: React.ReactNode;
  pending?: boolean;
  submitDisabled?: boolean;
  /** Shows "Save & add another" (create forms). */
  addAnother?: boolean;
  onDelete?: () => void;
  /** Labels of the fields that need fixing, for the footer summary. */
  issues?: string[];
  /** A save error that isn't about one field. */
  error?: string;
  children: React.ReactNode;
};

export function FormSheet({
  onSubmit,
  formKey,
  onValues,
  sections,
  progress,
  preview,
  submitLabel,
  pending,
  submitDisabled,
  addAnother,
  onDelete,
  issues = [],
  error,
  children,
  ...frame
}: FormSheetProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(sections?.[0]?.id);
  const [dirty, setDirty] = useState(false);
  const [mac, setMac] = useState(true);

  useEffect(() => setMac(/mac|iphone|ipad/i.test(navigator.userAgent)), []);
  useEffect(() => {
    setDirty(false);
    setCurrent(sections?.[0]?.id);
    bodyRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey, frame.open]);

  // Reads the form as soon as it mounts (and remounts on a new formKey), so
  // the preview starts from the real defaults.
  const formRef = useCallback(
    (form: HTMLFormElement | null) => {
      if (form && onValues) onValues(readForm(form));
    },
    [onValues]
  );

  function jump(id: string) {
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-form-section="${id}"]`);
    if (!body || !el) return;
    setCurrent(id);
    body.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
  }

  function trackSection() {
    const body = bodyRef.current;
    if (!body) return;
    const els = Array.from(body.querySelectorAll<HTMLElement>('[data-form-section]'));
    if (!els.length) return;
    const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
    let id = els[0].dataset.formSection;
    for (const el of els) if (el.offsetTop <= body.scrollTop + 48) id = el.dataset.formSection;
    setCurrent(atEnd ? els[els.length - 1].dataset.formSection : id);
  }

  // After a failed save, bring the first section with a problem into view.
  const firstBad = sections?.find((s) => (s.issues ?? 0) > 0)?.id;
  useEffect(() => {
    if (firstBad) jump(firstBad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstBad]);

  const doneCount = sections?.filter((s) => s.done && !s.issues).length ?? 0;
  const status = progress ?? (onDelete ? (dirty ? 'Unsaved changes' : undefined) : sections?.length ? `${doneCount} of ${sections.length} done` : undefined);
  const message = issues.length ? `${issues.length === 1 ? '1 thing' : `${issues.length} things`} to fix — ${issues.join(', ')}` : error;

  return (
    <FormSheetFrame {...frame}>
      <form
        key={formKey}
        ref={formRef}
        onSubmit={onSubmit}
        onChange={(e) => {
          setDirty(true);
          onValues?.(readForm(e.currentTarget));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!pending && !submitDisabled) e.currentTarget.requestSubmit();
          }
        }}
        className="contents"
        noValidate
      >
        {sections && sections.length > 1 && (
          <nav aria-label="Form sections" className="flex h-12 flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-bg px-4 [scrollbar-width:none] sm:h-[46px] sm:px-[22px]">
            {sections.map((s, i) => {
              const bad = (s.issues ?? 0) > 0;
              const ok = !bad && s.done;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={current === s.id ? 'step' : undefined}
                  className={cn(
                    'inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-sm2 border px-2.5 text-[13px] font-semibold transition-colors sm:h-[26px] sm:px-2 sm:text-[11.5px]',
                    bad
                      ? 'border-red bg-surface text-red'
                      : current === s.id
                        ? 'border-brand bg-brand-light text-brand-dark'
                        : ok
                          ? 'border-line bg-surface text-green'
                          : 'border-line bg-surface text-ink-soft hover:text-ink'
                  )}
                >
                  {ok ? <Check size={13} strokeWidth={2.5} /> : <span>{i + 1}</span>}
                  {s.label}
                  {bad && <span>· fix {s.issues}</span>}
                </button>
              );
            })}
            {status && <span className="ml-auto flex-shrink-0 whitespace-nowrap pl-2 text-[11.5px] text-ink-faint">{status}</span>}
          </nav>
        )}

        <div ref={bodyRef} onScroll={trackSection} className="relative flex-1 overflow-y-auto overscroll-contain">
          {preview && (
            <div className="px-4 pb-4 pt-4 sm:px-[22px] sm:pb-[18px]">
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint">Preview · {preview.caption}</p>
              <div className="rounded-md2 border border-line bg-bg p-3">{preview.content}</div>
            </div>
          )}
          {children}
        </div>

        <div className="flex-shrink-0 border-t border-line bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 sm:flex sm:h-16 sm:items-center sm:gap-2 sm:px-[22px] sm:py-0">
          {onDelete && (
            <Button type="button" variant="ghost" onClick={onDelete} className="hidden px-2.5 text-red hover:bg-red-soft hover:text-red sm:inline-flex">
              <Trash2 size={14} /> Delete
            </Button>
          )}
          {message ? (
            <p role="alert" className="mb-2.5 flex min-w-0 items-start gap-1.5 text-[12.5px] font-semibold text-red sm:mb-0 sm:line-clamp-2 sm:flex-1 sm:text-[11.5px]">
              <AlertCircle size={15} className="mt-px flex-shrink-0" />
              <span className="min-w-0">{message}</span>
            </p>
          ) : (
            <p className="hidden flex-1 text-[11px] text-ink-faint sm:block">
              {!onDelete && (
                <>
                  <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd> <Kbd>↵</Kbd> save · <Kbd>Esc</Kbd> close
                </>
              )}
            </p>
          )}
          <div className="flex gap-2.5 sm:gap-2">
            {onDelete && (
              <Button type="button" variant="outline" onClick={onDelete} aria-label="Delete" className="h-12 w-12 flex-shrink-0 px-0 text-red sm:hidden">
                <Trash2 size={16} />
              </Button>
            )}
            <SheetClose asChild>
              <Button type="button" variant="ghost" className="hidden sm:inline-flex">
                Cancel
              </Button>
            </SheetClose>
            {addAnother && (
              <Button type="submit" name="_intent" value="another" variant="outline" disabled={pending || submitDisabled} className="h-12 flex-1 text-[14px] sm:h-9 sm:flex-none sm:text-[13px]">
                Save &amp; add another
              </Button>
            )}
            <Button type="submit" disabled={pending || submitDisabled} className="h-12 flex-[1.3] text-[14px] sm:h-9 sm:flex-none sm:text-[13px]">
              <Check size={14} /> {pending ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </FormSheetFrame>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-[4px] border border-b-2 border-line bg-surface px-1.5 py-px font-mono text-[10.5px] font-semibold text-ink-soft">{children}</kbd>;
}

/** A numbered block of the form. `id` matches its entry in `sections`. */
export function FormSection({ id, n, title, aside, done, children }: { id: string; n: number; title: string; aside?: React.ReactNode; done?: boolean; children: React.ReactNode }) {
  return (
    <section data-form-section={id} className="border-t-8 border-bg px-4 py-5 sm:border-t sm:border-line sm:px-[22px] sm:py-[18px]">
      {/* On a phone the note drops under the title instead of squeezing it. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:mb-3.5 sm:flex-nowrap">
        <span className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm2 text-[12px] font-bold text-surface sm:h-[22px] sm:w-[22px] sm:text-[11.5px]', done ? 'bg-green' : 'bg-ink')}>{n}</span>
        <h3 className="text-[16px] font-bold text-ink sm:text-[13.5px]">{title}</h3>
        {aside && <span className="w-full pl-[34px] text-[12px] leading-snug text-ink-faint sm:ml-auto sm:w-auto sm:pl-0 sm:text-right sm:text-[11.5px]">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** 6 columns from sm: up; 2 on a phone (fields are full width there unless
 * marked `half`). */
export function FormGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('grid grid-cols-2 gap-x-2.5 gap-y-4 sm:grid-cols-6 sm:gap-x-3.5 sm:gap-y-3', className)}>{children}</div>;
}

const SPAN = { 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4', 6: 'sm:col-span-6' } as const;

/** Label (with a red * or a grey "optional"), the control, then the error —
 * or, when there's none, the help line. */
export function FormField({
  label,
  htmlFor,
  required,
  optional,
  help,
  error,
  span = 6,
  half,
  className,
  children,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  /** `true` shows "optional"; a string replaces that word (e.g. "in any units"). */
  optional?: boolean | string;
  help?: React.ReactNode;
  error?: string;
  span?: keyof typeof SPAN;
  half?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0', half ? 'col-span-1' : 'col-span-2', SPAN[span], className)}>
      {label && (
        <label htmlFor={htmlFor} className="mb-[5px] flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-body sm:text-[11.5px]">
          {label}
          {required && <span className="text-red">*</span>}
          {optional && <span className="font-medium text-ink-faint">{typeof optional === 'string' ? optional : 'optional'}</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-[5px] flex items-start gap-1.5 text-[12px] font-semibold text-red sm:text-[11px]">
          <AlertCircle size={13} className="mt-px flex-shrink-0" />
          {error}
        </p>
      ) : help ? (
        <div className="mt-[5px] text-[12px] leading-snug text-ink-faint sm:text-[11px]">{help}</div>
      ) : null}
    </div>
  );
}

/** Text input with a fixed bit before/after it — ₹, %, pcs, Box. */
export const AffixInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { before?: React.ReactNode; after?: React.ReactNode; invalid?: boolean }
>(({ before, after, invalid, className, ...props }, ref) => (
  <div
    className={cn(
      'form-affix flex h-9 w-full overflow-hidden rounded-sm2 border bg-surface transition-colors focus-within:border-primary',
      invalid ? 'border-destructive focus-within:border-destructive' : 'border-border'
    )}
  >
    {before && <span className="flex flex-shrink-0 items-center border-r border-border bg-surface-alt px-2.5 text-[12px] font-semibold text-ink-soft">{before}</span>}
    <input ref={ref} aria-invalid={invalid || undefined} className={cn('h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint', className)} {...props} />
    {after && <span className="flex flex-shrink-0 items-center border-l border-border bg-surface-alt px-2.5 text-[12px] font-semibold text-ink-soft">{after}</span>}
  </div>
));
AffixInput.displayName = 'AffixInput';

/** Shared look for native <select>s inside a form sheet. */
export const selectClass =
  'h-9 w-full rounded-sm2 border border-border bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60';

/** Error outline for an Input/Textarea. */
export const invalidClass = 'border-destructive focus:border-destructive';

/** Row of quick-pick buttons — payment terms, roles, reasons. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2 sm:gap-1.5', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-11 rounded-sm2 border px-2 text-[14px] font-semibold transition-colors sm:h-9 sm:text-[12.5px]',
            value === o.value ? 'border-ink bg-ink text-surface' : 'border-border bg-surface text-ink-soft hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small colored label used in previews. */
export function Tag({ tone = 'grey', children }: { tone?: 'grey' | 'green' | 'red' | 'gold' | 'dark'; children: React.ReactNode }) {
  const tones = {
    grey: 'bg-surface-alt text-ink-soft',
    green: 'bg-green-soft text-green',
    red: 'bg-brand-light text-brand-dark',
    // --gold itself is too light to read as text on --gold-soft.
    gold: 'bg-gold-soft text-ink-body',
    dark: 'bg-ink text-surface',
  } as const;
  return <span className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 text-[10.5px] font-bold', tones[tone])}>{children}</span>;
}

/** Initials tile for previews of people and businesses. */
export function Initials({ name, className }: { name: string; className?: string }) {
  const letters =
    name
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  return <span className={cn('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-sm2 bg-ink text-[14px] font-bold text-surface', className)}>{letters}</span>;
}
