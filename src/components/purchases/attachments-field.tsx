'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ZoomableImage } from '@/components/ui/image-lightbox';
import { shrinkPhoto } from '@/components/products/product-images-field';
import { cn } from '@/lib/utils';
import { PURCHASE_ATTACHMENT_LIMIT } from './purchase-math';
import type { PurchaseAttachmentInfo } from '@/actions/purchases';

export type PendingAttachments = { existing: PurchaseAttachmentInfo[]; files: File[] };

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PDF_TYPE = 'application/pdf';

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))}MB`;

/** The purchase form's bill copies and photos — PDFs and images kept on the
 * bill for reference. Like ImagesField, kept attachments and newly picked
 * files both live in parent state; new files are only uploaded when the
 * bill is saved (see PurchaseForm's submit), so an abandoned form leaves
 * nothing behind in storage. */
export function AttachmentsField({
  value,
  onChange,
  maxBytes,
  canRemoveSaved,
  disabled,
  className,
}: {
  value: PendingAttachments;
  onChange: (v: PendingAttachments) => void;
  /** Per file — checked here so a bad pick is refused on the spot with its
   * name, not after a long upload (see uploadAttachment for the limits). */
  maxBytes: number;
  /** Only the owner can take a file off a saved bill (savePurchase checks). */
  canRemoveSaved: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const count = value.existing.length + value.files.length;
  const max = PURCHASE_ATTACHMENT_LIMIT;

  useEffect(() => {
    const urls = value.files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [value.files]);

  const savedPhotos = value.existing.filter((a) => IMAGE_TYPES.includes(a.contentType)).map((a) => a.url);

  async function pickFiles(fileList: FileList | null) {
    const picked = Array.from(fileList ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (!picked.length) return;
    setBusy(true);
    const problems: string[] = [];
    const accepted: File[] = [];
    const room = Math.max(max - count, 0);
    for (const file of picked) {
      if (accepted.length >= room) {
        problems.push(`Only ${max} files fit on one bill — the rest were skipped.`);
        break;
      }
      const isPdf = file.type === PDF_TYPE;
      if (!isPdf && !IMAGE_TYPES.includes(file.type)) {
        problems.push(`"${file.name}" isn't a PDF, JPG, PNG or WEBP file.`);
        continue;
      }
      const ready = isPdf ? file : await shrinkPhoto(file);
      if (ready.size > maxBytes) {
        problems.push(`"${file.name}" is over ${mb(maxBytes)}.${isPdf ? ' Scan it at a lower quality, or attach photos of the pages instead.' : ''}`);
        continue;
      }
      accepted.push(ready);
    }
    setBusy(false);
    if (accepted.length) onChange({ ...value, files: [...value.files, ...accepted] });
    if (problems.length) toast.error(problems.join(' '));
  }

  return (
    <div className={cn('rounded-xl2 border border-line bg-surface p-4 shadow-card', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
            <Paperclip size={14} className="text-brand" /> Bill copies &amp; photos
            <span className="font-mono text-[11px] font-bold text-ink-faint">
              {count}/{max}
            </span>
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-faint">For reference only — the supplier&apos;s bill as a PDF, or photos of it and the delivery.</p>
        </div>
        {count < max && (
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy || disabled}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} {busy ? 'Preparing…' : 'Attach files'}
          </Button>
        )}
      </div>

      {count > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {value.existing.map((a) => (
            <Tile
              key={a.url}
              name={a.name}
              size={a.size}
              disabled={disabled}
              onRemove={canRemoveSaved ? () => onChange({ ...value, existing: value.existing.filter((x) => x.url !== a.url) }) : undefined}
            >
              {IMAGE_TYPES.includes(a.contentType) ? <ZoomableImage src={a.url} alt={a.name} gallery={savedPhotos} /> : <PdfLink href={a.url} />}
            </Tile>
          ))}
          {value.files.map((f, i) => (
            <Tile
              key={`${f.name}-${i}`}
              name={f.name}
              size={f.size}
              unsaved
              disabled={disabled}
              onRemove={() => onChange({ ...value, files: value.files.filter((_, fi) => fi !== i) })}
            >
              {previews[i] && (f.type === PDF_TYPE ? <PdfLink href={previews[i]} /> : <ZoomableImage src={previews[i]} alt={f.name} />)}
            </Tile>
          ))}
        </div>
      )}

      <input ref={inputRef} type="file" accept={[...IMAGE_TYPES, PDF_TYPE].join(',')} multiple hidden onChange={(e) => pickFiles(e.target.files)} />
      <p className="mt-2 text-[11px] text-ink-faint">PDF, JPG, PNG or WEBP, up to {mb(maxBytes)} each. Large photos are shrunk automatically.</p>
    </div>
  );
}

function PdfLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-soft transition-colors hover:bg-surface hover:text-brand"
      aria-label="Open PDF"
    >
      <FileText size={22} />
      <span className="text-[9px] font-bold uppercase tracking-wide">PDF</span>
    </a>
  );
}

function Tile({
  name,
  size,
  unsaved,
  disabled,
  onRemove,
  children,
}: {
  name: string;
  size: number;
  unsaved?: boolean;
  disabled?: boolean;
  /** Omitted when this file can't be removed here. */
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="w-[88px]" title={name}>
      <div className="relative h-[88px] w-[88px] overflow-hidden rounded-md2 border border-line bg-surface-alt">
        {children}
        {unsaved && <span className="absolute bottom-0.5 left-0.5 rounded-sm2 bg-black/60 px-1 text-[9px] font-bold text-white">New</span>}
        {/* Always visible — a hover-only button can't be reached on a phone. */}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${name}`}
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-sm2 bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-50"
          >
            <X size={11} />
          </button>
        )}
      </div>
      <div className="mt-1 truncate text-[10.5px] font-semibold text-ink-body">{name}</div>
      <div className="text-[10px] text-ink-faint">{fileSize(size)}</div>
    </div>
  );
}
