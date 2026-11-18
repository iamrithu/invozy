'use client';

import { useEffect, useState } from 'react';
import { BadgePercent, Sparkles, TicketPercent } from 'lucide-react';
import { toast } from 'sonner';
import type { DiscountKind, DiscountScope, OrderSource } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AffixInput, FormField, FormGrid, FormSection, FormSheet, Segmented, Tag } from '@/components/ui/form-sheet';
import { useSaveCoupon } from '@/hooks/use-coupons';
import { useCategoryOptions } from '@/hooks/use-categories';
import type { CouponRow } from '@/actions/coupons';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

const istDate = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : '');

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Create or edit a coupon code, or (automatic) an automatic discount. */
export function CouponFormSheet({
  open,
  onOpenChange,
  coupon,
  automatic,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: CouponRow | null;
  automatic: boolean;
  groups: { id: string; name: string }[];
}) {
  const save = useSaveCoupon();
  const { data: categories = [] } = useCategoryOptions();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DiscountKind>('PERCENT');
  const [value, setValue] = useState('10');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [scope, setScope] = useState<DiscountScope>('ALL');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [who, setWho] = useState<'everyone' | 'first' | 'groups'>('everyone');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<OrderSource[]>(['MANUAL', 'WEB']);
  const [usageLimit, setUsageLimit] = useState('');
  const [perCustomer, setPerCustomer] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [combinable, setCombinable] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const c = coupon;
    setCode(c?.code ?? '');
    setTitle(c?.title ?? '');
    setKind(c?.kind ?? 'PERCENT');
    setValue(c ? String(c.value) : automatic ? '3' : '10');
    setMaxDiscount(c?.maxDiscount ? String(c.maxDiscount) : '');
    setMinOrder(c?.minOrderValue ? String(c.minOrderValue) : '');
    setScope(c?.scope ?? 'ALL');
    setCategoryIds(c?.categoryIds ?? []);
    setWho(c?.customerGroupIds.length ? 'groups' : c?.firstOrderOnly ? 'first' : 'everyone');
    setGroupIds(c?.customerGroupIds ?? []);
    setChannels(c?.channels ?? ['MANUAL', 'WEB']);
    setUsageLimit(c?.usageLimit ? String(c.usageLimit) : '');
    setPerCustomer(c?.perCustomerLimit ? String(c.perCustomerLimit) : automatic ? '' : '1');
    setStartsAt(istDate(c?.startsAt ?? null));
    setEndsAt(istDate(c?.endsAt ?? null));
    setCombinable(c?.combinable ?? false);
    setActive(c?.active ?? true);
    setError(undefined);
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coupon?.id, automatic]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const num = (s: string) => (s.trim() ? Number(s) : null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setFieldErrors({});
    try {
      await save.mutateAsync({
        id: coupon?.id,
        input: {
          automatic,
          code: automatic ? null : code,
          title: title || (automatic ? '' : code),
          kind,
          value: num(value) ?? 0,
          maxDiscount: num(maxDiscount),
          minOrderValue: num(minOrder) ?? 0,
          scope,
          categoryIds,
          firstOrderOnly: who === 'first',
          customerGroupIds: who === 'groups' ? groupIds : [],
          channels,
          usageLimit: num(usageLimit),
          perCustomerLimit: num(perCustomer),
          combinable,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          active,
        },
      });
      toast.success(coupon ? 'Saved' : automatic ? `${title} is on` : `Coupon ${code} created`);
      onOpenChange(false);
    } catch (err) {
      const e2 = err as Error & { fieldErrors?: Record<string, string> };
      setError(e2.message);
      setFieldErrors(e2.fieldErrors ?? {});
    }
  }

  const v = num(value) ?? 0;
  const off = kind === 'PERCENT' ? `${v}% off${maxDiscount ? ` up to ${fmtInr(Number(maxDiscount))}` : ''}` : kind === 'FLAT' ? `${fmtInr(v)} off` : 'Free delivery';
  const where = scope === 'CATEGORIES' ? (categoryIds.length ? categories.filter((c) => categoryIds.includes(c.id)).map((c) => c.name).join(', ') : 'chosen categories') : 'everything';
  const summary = [
    `${off} on ${where}`,
    num(minOrder) ? `orders of ${fmtInr(Number(minOrder))} or more` : 'any order size',
    who === 'first' ? 'first order only' : who === 'groups' ? 'chosen customer groups' : null,
    channels.length === 2 ? 'web store and manual orders' : channels[0] === 'WEB' ? 'web store only' : channels[0] === 'MANUAL' ? 'manual orders only' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const issues = Object.keys(fieldErrors).map((k) => ({ code: 'Code', title: 'Title', value: 'Amount', minOrderValue: 'Minimum', categoryIds: 'Categories', channels: 'Works on', endsAt: 'Dates', kind: 'Type' })[k] ?? k);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      icon={coupon ? automatic ? <BadgePercent size={18} /> : <TicketPercent size={18} /> : <Sparkles size={18} />}
      title={coupon ? (automatic ? 'Edit automatic discount' : `Edit ${coupon.code}`) : automatic ? 'New automatic discount' : 'Create coupon'}
      subtitle={automatic ? 'Discounts · applies by itself to qualifying orders' : 'Coupons · customers type the code at checkout'}
      formKey={`${coupon?.id ?? 'new'}-${automatic}`}
      onSubmit={submit}
      submitLabel={coupon ? 'Save' : 'Create'}
      pending={save.isPending}
      issues={issues}
      error={error}
      headerAside={
        <label className="mr-1 flex items-center gap-2 text-[12px] font-semibold text-ink-soft">
          {active ? 'On' : 'Off'}
          <Switch checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="On" />
        </label>
      }
      sections={[
        { id: 'offer', label: 'Offer', done: !!(automatic ? title : code) && (kind === 'FREE_DELIVERY' || v > 0) },
        { id: 'rules', label: 'Who and where' },
        { id: 'limits', label: 'Limits & dates' },
      ]}
      preview={{
        caption: automatic ? 'how it reads on an order' : 'what the customer sees',
        content: (
          <div className="flex items-start gap-3">
            <span className={cn('flex h-11 min-w-[44px] items-center justify-center rounded-sm2 px-2 font-mono text-[12px] font-bold', automatic ? 'bg-green-soft text-green' : 'border border-dashed border-brand bg-brand-light text-brand-dark')}>
              {automatic ? '%' : code || 'CODE'}
            </span>
            <div className="min-w-0">
              <div className={cn('text-[14px] font-bold', title || code ? 'text-ink' : 'text-ink-faint')}>{title || (automatic ? 'Discount name' : 'Coupon title')}</div>
              <div className="mt-0.5 text-[12px] text-ink-soft">{summary}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {active ? <Tag tone="green">On</Tag> : <Tag>Off</Tag>}
                {!automatic && combinable && <Tag>Stacks on automatic discounts</Tag>}
              </div>
            </div>
          </div>
        ),
      }}
    >
      <FormSection id="offer" n={1} title="Offer">
        <FormGrid>
          {!automatic && (
            <FormField label="Code" required htmlFor="cp-code" span={3} error={fieldErrors.code} help={coupon && coupon.usedCount > 0 ? 'Used codes can’t be renamed.' : 'Letters, numbers and dashes. Not case-sensitive.'}>
              <div className="flex gap-2">
                <Input id="cp-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} maxLength={20} className="font-mono uppercase" disabled={!!coupon && coupon.usedCount > 0} placeholder="ICE10" autoComplete="off" />
                {!coupon && (
                  <button type="button" onClick={() => setCode(randomCode())} className="h-9 whitespace-nowrap rounded-sm2 border border-border px-3 text-[12px] font-semibold text-ink-soft hover:bg-surface-alt hover:text-ink">
                    Generate
                  </button>
                )}
              </div>
            </FormField>
          )}
          <FormField label={automatic ? 'Name' : 'Title'} required={automatic} optional={!automatic} htmlFor="cp-title" span={automatic ? 6 : 3} error={fieldErrors.title} help={automatic ? 'Shown on the order and invoice, e.g. Bulk order.' : 'Shown next to the code.'}>
            <Input id="cp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={automatic ? 'Bulk order' : '10% off cube ice'} />
          </FormField>
          <FormField label="Type" span={6} error={fieldErrors.kind}>
            <Segmented
              label="Type"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'PERCENT', label: 'Percentage' },
                { value: 'FLAT', label: 'Fixed amount' },
                ...(automatic ? [] : [{ value: 'FREE_DELIVERY' as const, label: 'Free delivery' }]),
              ]}
            />
          </FormField>
          {kind !== 'FREE_DELIVERY' && (
            <FormField label={kind === 'PERCENT' ? 'Percent off' : 'Amount off'} required htmlFor="cp-value" span={3} error={fieldErrors.value}>
              <AffixInput id="cp-value" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" {...(kind === 'PERCENT' ? { after: '%' } : { before: '₹' })} />
            </FormField>
          )}
          {kind === 'PERCENT' && (
            <FormField label="Maximum discount" optional="no cap if blank" htmlFor="cp-max" span={3}>
              <AffixInput id="cp-max" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} inputMode="decimal" before="₹" />
            </FormField>
          )}
          <FormField label="Minimum order value" required={automatic} optional={!automatic} htmlFor="cp-min" span={3} error={fieldErrors.minOrderValue} help="Checked on the goods, before GST and delivery.">
            <AffixInput id="cp-min" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} inputMode="decimal" before="₹" />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection id="rules" n={2} title="Who and where">
        <FormGrid>
          <FormField label="Applies to" span={6} error={fieldErrors.categoryIds}>
            <Segmented
              label="Applies to"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'ALL', label: 'Every product' },
                { value: 'CATEGORIES', label: 'Some categories' },
              ]}
            />
            {scope === 'CATEGORIES' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {categories.length === 0 && <span className="text-[12px] text-ink-faint">No active categories yet.</span>}
                {categories.map((c) => (
                  <Chip key={c.id} on={categoryIds.includes(c.id)} onClick={() => setCategoryIds((l) => toggle(l, c.id))}>
                    {c.name}
                  </Chip>
                ))}
              </div>
            )}
          </FormField>
          <FormField label="Who can use it" span={6}>
            <Segmented
              label="Who can use it"
              value={who}
              onChange={setWho}
              options={[
                { value: 'everyone', label: 'Everyone' },
                ...(automatic ? [] : [{ value: 'first' as const, label: 'First order only' }]),
                ...(groups.length ? [{ value: 'groups' as const, label: 'Customer groups' }] : []),
              ]}
            />
            {who === 'groups' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <Chip key={g.id} on={groupIds.includes(g.id)} onClick={() => setGroupIds((l) => toggle(l, g.id))}>
                    {g.name}
                  </Chip>
                ))}
              </div>
            )}
          </FormField>
          <FormField label="Works on" span={6} error={fieldErrors.channels}>
            <div className="flex flex-wrap gap-1.5">
              <Chip on={channels.includes('WEB')} onClick={() => setChannels((l) => toggle(l, 'WEB'))}>
                Web store orders
              </Chip>
              <Chip on={channels.includes('MANUAL')} onClick={() => setChannels((l) => toggle(l, 'MANUAL'))}>
                Manual orders
              </Chip>
            </div>
          </FormField>
          {!automatic && (
            <FormField span={6}>
              <label className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-[13px] font-semibold text-ink">Can be used with automatic discounts</span>
                  <span className="block text-[11.5px] text-ink-faint">Off: the code is refused while an automatic discount applies to the order.</span>
                </span>
                <Switch checked={combinable} onChange={(e) => setCombinable(e.target.checked)} aria-label="Can be used with automatic discounts" />
              </label>
            </FormField>
          )}
        </FormGrid>
      </FormSection>

      <FormSection id="limits" n={3} title="Limits & dates" aside="All optional">
        <FormGrid>
          {!automatic && (
            <>
              <FormField label="Total uses" optional="unlimited if blank" htmlFor="cp-limit" span={3}>
                <Input id="cp-limit" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
              </FormField>
              <FormField label="Uses per customer" optional="unlimited if blank" htmlFor="cp-per" span={3}>
                <Input id="cp-per" value={perCustomer} onChange={(e) => setPerCustomer(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
              </FormField>
            </>
          )}
          <FormField label="Starts" optional htmlFor="cp-start" span={3}>
            <Input id="cp-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </FormField>
          <FormField label="Ends" optional htmlFor="cp-end" span={3} error={fieldErrors.endsAt} help="Runs to the end of that day (IST).">
            <Input id="cp-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </FormField>
        </FormGrid>
      </FormSection>
    </FormSheet>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn('h-8 rounded-sm2 border px-2.5 text-[12px] font-semibold transition-colors', on ? 'border-brand bg-brand-light text-brand-dark' : 'border-border text-ink-soft hover:text-ink')}
    >
      {children}
    </button>
  );
}
