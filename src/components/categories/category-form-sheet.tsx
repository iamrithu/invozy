'use client';

import { useEffect, useMemo, useState } from 'react';
import { FolderTree, ImagePlus, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AffixInput, FormField, FormGrid, FormSection, FormSheet, Segmented, Tag, selectClass, submitIntent } from '@/components/ui/form-sheet';
import { useSaveCategory } from '@/hooks/use-categories';
import type { CategoryRow } from '@/actions/categories';
import { slugify } from '@/lib/slug';
import { cn } from '@/lib/utils';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Add or edit a category. The slug follows the name until it's edited by
 * hand; the image is uploaded with the form. */
export function CategoryFormSheet({
  open,
  onOpenChange,
  category,
  categories,
  storeHost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryRow | null;
  /** Every category, for the parent picker and the slug check. */
  categories: CategoryRow[];
  /** Shown before the slug, e.g. "invozy.in/s/arctic-blocks/c/". */
  storeHost: string;
}) {
  const save = useSaveCategory();
  const [formKey, setFormKey] = useState(0);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [showOnStore, setShowOnStore] = useState(true);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setSlug(category?.slug ?? '');
    setSlugTouched(!!category);
    setStatus(category?.status ?? 'ACTIVE');
    setShowOnStore(category?.showOnStore ?? true);
    setImage(null);
    setRemoveImage(false);
    setError(undefined);
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id]);

  // A blob URL for the picked file; revoked when it changes.
  useEffect(() => {
    if (!image) return setPreview(null);
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const parents = useMemo(() => categories.filter((c) => !c.deletedAt && !c.parentId && c.status === 'ACTIVE' && c.id !== category?.id), [categories, category?.id]);
  const slugClash = useMemo(() => (slug ? categories.find((c) => c.slug === slug && c.id !== category?.id) : undefined), [categories, slug, category?.id]);
  const shownImage = preview ?? (removeImage ? null : category?.imageUrl ?? null);

  function onName(next: string) {
    setName(next);
    if (!slugTouched) setSlug(slugify(next));
  }

  function onPick(file: File | null) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('Pick a PNG, JPG or WebP image.');
    if (file.size > MAX_IMAGE_BYTES) return toast.error('That image is over 4 MB. Pick a smaller one.');
    setImage(file);
    setRemoveImage(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const intent = submitIntent(e);
    const fd = new FormData(e.currentTarget);
    fd.set('name', name);
    fd.set('slug', slug);
    fd.set('status', status);
    fd.set('showOnStore', showOnStore ? 'true' : 'false');
    fd.delete('image');
    if (image) fd.set('image', image);
    if (removeImage) fd.set('removeImage', 'true');
    setError(undefined);
    setFieldErrors({});
    try {
      await save.mutateAsync({ id: category?.id, formData: fd });
      toast.success(category ? `${name} saved` : `Added ${name}`);
      if (!category && intent === 'another') {
        setName('');
        setSlug('');
        setSlugTouched(false);
        setImage(null);
        setFormKey((k) => k + 1);
        return;
      }
      onOpenChange(false);
    } catch (err) {
      const e2 = err as Error & { fieldErrors?: Record<string, string> };
      setError(e2.message);
      setFieldErrors(e2.fieldErrors ?? {});
    }
  }

  const slugError = fieldErrors.slug || (slugClash ? `/${slug} is used by ${slugClash.name}${slugClash.deletedAt ? ' (in Trash)' : ''}.` : undefined);
  const issues = [fieldErrors.name && 'Name', slugError && 'Slug', fieldErrors.parentId && 'Parent'].filter(Boolean) as string[];
  const sections = [
    { id: 'basics', label: 'Basics', done: !!name.trim() && !slugError, issues: (fieldErrors.name ? 1 : 0) + (slugError ? 1 : 0) },
    { id: 'display', label: 'Image & display', done: !!shownImage },
    { id: 'seo', label: 'Search listing' },
  ];

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      icon={category ? <FolderTree size={18} /> : <Sparkles size={18} />}
      title={category ? 'Edit category' : 'New category'}
      subtitle={category ? `Categories · ${category.name}` : 'Catalog · group products for orders, reports and your store'}
      formKey={`${category?.id ?? 'new'}-${formKey}`}
      onSubmit={submit}
      sections={sections}
      submitLabel={category ? 'Save category' : 'Create category'}
      pending={save.isPending}
      submitDisabled={!name.trim() || !!slugClash}
      addAnother={!category}
      issues={issues}
      error={error}
      preview={{
        caption: 'how it shows on your web store',
        content: (
          <div className="flex items-center gap-3">
            <CategoryThumb url={shownImage} size={48} />
            <div className="min-w-0 flex-1">
              <div className={cn('truncate text-[14px] font-bold', name ? 'text-ink' : 'text-ink-faint')}>{name || 'Category name'}</div>
              <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-faint">/{slug || 'slug'}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {status === 'ACTIVE' ? <Tag tone="green">Active</Tag> : <Tag>Disabled</Tag>}
                {showOnStore && status === 'ACTIVE' ? <Tag>Shown on store</Tag> : <Tag>Hidden from store</Tag>}
              </div>
            </div>
          </div>
        ),
      }}
    >
      <FormSection id="basics" n={1} title="Basics" aside="Name is required" done={sections[0].done}>
        <FormGrid>
          <FormField label="Name" required htmlFor="cat-name" error={fieldErrors.name}>
            <Input id="cat-name" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Cube ice" maxLength={60} autoFocus={!category} />
          </FormField>
          <FormField
            label="Slug"
            htmlFor="cat-slug"
            error={slugError}
            help={category ? 'Changing it changes this category’s web store link.' : 'Filled from the name until you edit it.'}
          >
            <AffixInput
              id="cat-slug"
              before={<span className="max-w-[160px] truncate font-mono text-[11px] sm:max-w-[220px]">{storeHost}</span>}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
              }}
              invalid={!!slugError}
              className="font-mono"
              autoComplete="off"
            />
          </FormField>
          <FormField label="Parent category" htmlFor="cat-parent" optional error={fieldErrors.parentId} help="One level deep, e.g. Party packs inside Cube ice.">
            <select id="cat-parent" name="parentId" defaultValue={category?.parentId ?? ''} className={selectClass}>
              <option value="">None (top level)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Description" htmlFor="cat-desc" optional>
            <Textarea id="cat-desc" name="description" defaultValue={category?.description ?? ''} rows={3} maxLength={500} placeholder="Shown at the top of the category on your store." />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection id="display" n={2} title="Image & display" done={sections[1].done}>
        <FormGrid>
          <FormField label="Image" optional="square works best" span={6}>
            <div className="flex items-center gap-3">
              <CategoryThumb url={shownImage} size={64} />
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm2 border border-line bg-surface px-3 text-[12.5px] font-semibold text-ink hover:bg-surface-alt">
                  <ImagePlus size={14} /> {shownImage ? 'Replace' : 'Upload image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
                </label>
                {shownImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setImage(null);
                      setRemoveImage(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-sm2 px-3 text-[12.5px] font-semibold text-ink-soft hover:bg-surface-alt hover:text-ink"
                  >
                    <X size={14} /> Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">PNG, JPG or WebP, up to 4 MB. Used on the web store and in pickers.</p>
          </FormField>
          <FormField label="Status" span={6} help="Disabled categories stay on their products but can’t be picked for new ones, and are hidden from the store.">
            <Segmented
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'DISABLED', label: 'Disabled' },
              ]}
            />
          </FormField>
          <FormField span={6}>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-[13px] font-semibold text-ink">Show on the web store</span>
                <span className="block text-[11.5px] text-ink-faint">Turn off for trade-only lines you don’t sell online.</span>
              </span>
              <Switch checked={showOnStore} onChange={(e) => setShowOnStore(e.target.checked)} aria-label="Show on the web store" />
            </label>
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection id="seo" n={3} title="Search listing" aside="How the category page appears on Google">
        <FormGrid>
          <FormField label="Page title" htmlFor="cat-seo-title" optional>
            <Input id="cat-seo-title" name="seoTitle" defaultValue={category?.seoTitle ?? ''} maxLength={70} placeholder={name ? `${name} – order online` : 'Defaults to the category name'} />
          </FormField>
          <FormField label="Meta description" htmlFor="cat-seo-desc" optional>
            <Textarea id="cat-seo-desc" name="seoDescription" defaultValue={category?.seoDescription ?? ''} rows={2} maxLength={160} />
          </FormField>
        </FormGrid>
      </FormSection>
    </FormSheet>
  );
}

/** A category's image, or a neutral tile with its icon. */
export function CategoryThumb({ url, size = 40 }: { url: string | null; size?: number }) {
  return (
    <span className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-md2 bg-surface-alt text-ink-faint" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <FolderTree size={Math.round(size * 0.42)} />
      )}
    </span>
  );
}
