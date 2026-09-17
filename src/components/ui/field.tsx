'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type ChangeHandler = (e: { target: { value: string } }) => void;

type FieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: ChangeHandler;
  error?: string;
  mono?: boolean;
  as?: 'input' | 'textarea' | 'select';
  type?: string;
  icon?: LucideIcon;
  options?: { value: string; label?: string }[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

/** Shared field shell for every form in the app — input, textarea, or select,
 * all with the same optional label icon and error-state styling. Works both
 * uncontrolled (`defaultValue`) and controlled (`value`+`onChange`). The
 * icon sits beside the label, not inside the control — keeps the input's
 * text fully left-aligned and avoids the icon clipping against rounded
 * corners on dense layouts. */
export function Field({
  label,
  name,
  defaultValue,
  value,
  onChange,
  error,
  mono,
  as = 'input',
  type = 'text',
  icon: Icon,
  options,
  placeholder,
  required,
  disabled,
}: FieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const valueProps = value !== undefined ? { value, onChange } : { defaultValue };
  const isPassword = as === 'input' && type === 'password';
  const controlClassName = clsx(error && 'border-destructive focus:border-destructive', mono && 'font-mono', isPassword && 'pr-9');

  return (
    <div>
      <Label htmlFor={name} className="flex items-center gap-1.5">
        {Icon && <Icon size={12} className="flex-shrink-0 text-ink-faint" />}
        {label}
      </Label>
      {as === 'textarea' ? (
        <Textarea id={name} name={name} rows={3} placeholder={placeholder} required={required} disabled={disabled} className={controlClassName} {...valueProps} />
      ) : as === 'select' ? (
        <select
          id={name}
          name={name}
          required={required}
          disabled={disabled}
          className={clsx(
            'w-full rounded-sm2 border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60',
            error && 'border-destructive focus:border-destructive'
          )}
          {...valueProps}
        >
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))}
        </select>
      ) : isPassword ? (
        <div className="relative">
          <Input
            id={name}
            name={name}
            type={showPassword ? 'text' : 'password'}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className={controlClassName}
            {...valueProps}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center text-ink-faint hover:text-ink-soft"
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      ) : (
        <Input id={name} name={name} type={type} placeholder={placeholder} required={required} disabled={disabled} className={controlClassName} {...valueProps} />
      )}
      {error && <p className="mt-1 text-[11px] font-semibold text-destructive">{error}</p>}
    </div>
  );
}
