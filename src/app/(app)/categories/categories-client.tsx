'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Eye, EyeOff, FolderTree, GripVertical, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CategoryFormSheet, CategoryThumb } from '@/components/categories/category-form-sheet';
import { useCurrentUser } from '@/components/current-user';
import {
  useCategories,
  usePurgeCategory,
  useReorderCategories,
  useRestoreCategory,
  useSetCategoryOnStore,
  useSetCategoryStatus,
  useTrashCategory,
} from '@/hooks/use-categories';
import type { CategoryCounts, CategoryRow } from '@/actions/categories';
import { selectClass } from '@/components/ui/form-sheet';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'active' | 'disabled' | 'trash';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'trash', label: 'Trash' },
];

const TRASH_DAYS = 30;

export function CategoriesClient({ initialData, storeHost }: { initialData: { rows: CategoryRow[]; counts: CategoryCounts }; storeHost: string }) {
  const me = useCurrentUser();
  const { data } = useCategories(initialData);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const counts = data?.counts ?? initialData.counts;
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [trashTarget, setTrashTarget] = useState<CategoryRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<CategoryRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const setStatus = useSetCategoryStatus();
  const setOnStore = useSetCategoryOnStore();
  const reorder = useReorderCategories();
  const restore = useRestoreCategory();
  const purge = usePurgeCategory();

  const q = search.trim().toLowerCase();
  const visible = rows.filter((c) => {
    const inTab = tab === 'trash' ? !!c.deletedAt : !c.deletedAt && (tab === 'all' || (tab === 'active' ? c.status === 'ACTIVE' : c.status === 'DISABLED'));
    return inTab && (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q));
  });
  const canDrag = tab !== 'trash' && !q;

  function openForm(c: CategoryRow | null) {
    setEditing(c);
    setFormOpen(true);
  }

  async function toggleStatus(c: CategoryRow, active: boolean) {
    try {
      await setStatus.mutateAsync({ id: c.id, status: active ? 'ACTIVE' : 'DISABLED' });
      toast.success(active ? `${c.name} is active again` : `${c.name} disabled. Its ${c.productCount} product${c.productCount === 1 ? '' : 's'} keep it.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleStore(c: CategoryRow) {
    try {
      await setOnStore.mutateAsync({ id: c.id, show: !c.showOnStore });
      toast.success(c.showOnStore ? `${c.name} hidden from the web store` : `${c.name} shown on the web store`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const live = rows.filter((c) => !c.deletedAt);
    const ids = live.map((c) => c.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    try {
      await reorder.mutateAsync(ids);
      toast.success('Order saved. The web store lists categories in this order.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doRestore(c: CategoryRow) {
    try {
      await restore.mutateAsync(c.id);
      toast.success(`${c.name} restored`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doPurge() {
    if (!purgeTarget) return;
    try {
      await purge.mutateAsync(purgeTarget.id);
      toast.success(`${purgeTarget.name} deleted for good`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setPurgeTarget(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
            <FolderTree size={18} className="text-brand" /> Categories
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Group products for orders, reports, coupons and your web store.</p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus size={13} /> New category
        </Button>
      </div>

      <div className="rounded-xl2 border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 pt-1">
          <div role="tablist" className="-mb-px flex overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[12.5px] font-bold transition-colors',
                  tab === t.key ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:text-ink'
                )}
              >
                {t.label}
                <span className="rounded-sm2 bg-surface-alt px-1.5 text-[10.5px] tabular-nums text-ink-soft">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative my-2 w-full sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or slug" className="pl-8" aria-label="Search categories" />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-ink-faint">
            {tab === 'trash' ? <Trash2 size={28} /> : <FolderTree size={28} />}
            <p className="text-[13.5px] font-bold text-ink-soft">
              {q ? 'No categories match.' : tab === 'trash' ? 'Trash is empty.' : tab === 'disabled' ? 'No disabled categories.' : 'No categories yet.'}
            </p>
            {!q && tab === 'all' && (
              <Button size="sm" onClick={() => openForm(null)}>
                <Plus size={13} /> Add your first category
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((c) => {
              const shown = c.showOnStore && c.status === 'ACTIVE';
              return (
                <li
                  key={c.id}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    setDragId(c.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!canDrag || !dragId) return;
                    e.preventDefault();
                    setOverId(c.id);
                  }}
                  onDragLeave={() => setOverId((cur) => (cur === c.id ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    void drop(c.id);
                    setOverId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap sm:px-4',
                    dragId === c.id && 'opacity-40',
                    overId === c.id && dragId !== c.id && 'shadow-[inset_0_2px_0_hsl(var(--brand))]'
                  )}
                >
                  {canDrag && (
                    <span className="hidden cursor-grab text-ink-faint sm:block" title="Drag to change the order on the web store" aria-hidden>
                      <GripVertical size={16} />
                    </span>
                  )}
                  <CategoryThumb url={c.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13.5px] font-bold text-ink">{c.name}</span>
                      {c.status === 'DISABLED' && !c.deletedAt && <span className="rounded-sm2 bg-surface-alt px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-ink-soft">Disabled</span>}
                    </div>
                    <div className="truncate text-[11.5px] text-ink-faint">
                      <span className="font-mono">/{c.slug}</span>
                      {c.parentName && <> · in {c.parentName}</>}
                      {c.description && !c.parentName && <> · {c.description}</>}
                    </div>
                  </div>

                  <Link
                    href={`/products?category=${encodeURIComponent(c.name)}`}
                    className="w-[92px] text-right text-[12px] font-semibold text-ink-soft hover:text-brand"
                    title={`See ${c.name}’s products`}
                  >
                    {c.productCount} product{c.productCount === 1 ? '' : 's'}
                  </Link>

                  {c.deletedAt ? (
                    <div className="flex items-center gap-2">
                      <span className="hidden text-[11.5px] text-ink-faint md:inline">Deleted {new Date(c.deletedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      {me.isOwner && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => doRestore(c)} disabled={restore.isPending}>
                            <RotateCcw size={13} /> Restore
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red" onClick={() => setPurgeTarget(c)} disabled={c.productCount > 0} title={c.productCount > 0 ? 'Products still use it' : undefined}>
                            Delete forever
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleStore(c)}
                        disabled={c.status === 'DISABLED'}
                        title={c.status === 'DISABLED' ? 'Disabled categories are hidden from the store' : shown ? 'Shown on the web store. Click to hide.' : 'Hidden from the web store. Click to show.'}
                        className={cn(
                          'flex h-8 items-center gap-1.5 rounded-sm2 px-2 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed',
                          shown ? 'text-ink-soft hover:bg-surface-alt' : 'text-ink-faint hover:bg-surface-alt'
                        )}
                      >
                        {shown ? <Eye size={14} /> : <EyeOff size={14} />}
                        <span className="hidden lg:inline">{shown ? 'On store' : 'Hidden'}</span>
                      </button>
                      <Switch checked={c.status === 'ACTIVE'} onChange={(e) => toggleStatus(c, e.target.checked)} aria-label={`${c.name} active`} className="mx-1.5" />
                      <button type="button" onClick={() => openForm(c)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-surface-alt hover:text-ink" aria-label={`Edit ${c.name}`}>
                        <Pencil size={14} />
                      </button>
                      {me.isOwner && (
                        <button type="button" onClick={() => setTrashTarget(c)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-brand-light hover:text-brand" aria-label={`Delete ${c.name}`}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="border-t border-line px-4 py-3 text-[11.5px] leading-relaxed text-ink-faint">
          {tab === 'trash'
            ? `Deleted categories are kept for ${TRASH_DAYS} days and can be restored. Their slugs stay reserved until they’re deleted for good.`
            : 'Disable hides a category from the web store and from the picker for new products; its products keep it. Delete moves it to Trash after its products are moved to another category.'}
        </p>
      </div>

      <CategoryFormSheet open={formOpen} onOpenChange={setFormOpen} category={editing} categories={rows} storeHost={storeHost} />
      <TrashDialog target={trashTarget} categories={rows} onClose={() => setTrashTarget(null)} />
      <ConfirmDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
        title="Delete for good?"
        description={
          <>
            <b className="font-bold text-ink">{purgeTarget?.name}</b> will be removed and its slug <span className="font-mono">/{purgeTarget?.slug}</span> becomes free. This can’t be undone.
          </>
        }
        confirmLabel="Delete forever"
        pending={purge.isPending}
        onConfirm={doPurge}
      />
    </div>
  );
}

/** Delete = move to Trash. A category with products first hands them to
 * another active category. */
function TrashDialog({ target, categories, onClose }: { target: CategoryRow | null; categories: CategoryRow[]; onClose: () => void }) {
  const trash = useTrashCategory();
  const others = categories.filter((c) => !c.deletedAt && c.status === 'ACTIVE' && c.id !== target?.id);
  const [moveTo, setMoveTo] = useState('');
  const n = target?.productCount ?? 0;
  const chosen = moveTo || others[0]?.id || '';

  async function confirm() {
    if (!target) return;
    try {
      await trash.mutateAsync({ id: target.id, moveTo: n > 0 ? chosen : null });
      toast.success(n > 0 ? `${target.name} moved to Trash. ${n} product${n === 1 ? '' : 's'} moved.` : `${target.name} moved to Trash`);
      setMoveTo('');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !trash.isPending && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Delete {target?.name}?</DialogTitle>
        </DialogHeader>
        {n > 0 ? (
          others.length === 0 ? (
            <p className="text-[13px] text-ink-soft">
              {n} product{n === 1 ? ' uses' : 's use'} this category, and there’s no other active category to move {n === 1 ? 'it' : 'them'} to. Create one first.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-ink-soft">
                {n} product{n === 1 ? ' uses' : 's use'} this category. Choose where {n === 1 ? 'it goes' : 'they go'}; then the category moves to Trash.
              </p>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Move products to</span>
                <select value={chosen} onChange={(e) => setMoveTo(e.target.value)} className={selectClass}>
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )
        ) : (
          <p className="text-[13px] text-ink-soft">It moves to Trash for {TRASH_DAYS} days and can be restored. Its slug stays reserved until then.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={trash.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={trash.isPending || (n > 0 && others.length === 0)}>
            {n > 0 ? `Move ${n} and delete` : 'Move to Trash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
