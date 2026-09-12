'use client';

import { useState } from 'react';
import { Tag } from 'lucide-react';
import { useProductCategories } from '@/hooks/use-products';

/** Category is a plain string on Product — no separate category table to
 * manage — but typing "Milk" then "milk" then "Milks" on later products
 * would fragment the catalog into near-duplicate groups. This suggests the
 * company's own existing category strings as the user types, so reusing one
 * is a click away, while still allowing a brand new category by typing
 * something that doesn't match anything shown. */
export function CategoryCombobox({
  name,
  value,
  onChange,
  label = 'Category',
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useProductCategories();
  const filtered = value.trim() ? categories.filter((c) => c.toLowerCase().includes(value.toLowerCase())) : categories;

  return (
    <div className="relative">
      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-ink-faint">
        <Tag size={12} className="flex-shrink-0" /> {label}
      </label>
      <input
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Milk, Dairy, Snacks…"
        autoComplete="off"
        className="w-full rounded-sm2 border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand-light"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 max-h-40 overflow-y-auto rounded-md2 border border-line bg-popover shadow-elevated">
          {filtered.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="flex w-full items-center px-3 py-2 text-left text-[12.5px] font-semibold text-ink hover:bg-brand-light"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
