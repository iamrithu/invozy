import { Globe, Mail, MessageCircle, Phone, Store, UserRound, type LucideIcon } from 'lucide-react';
import type { OrderChannel, OrderStatus } from '@prisma/client';
import { cn } from '@/lib/utils';

// How orders look across the list, the detail page and the form.

export const STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-surface-alt text-ink-soft' },
  PENDING: { label: 'New', className: 'bg-gold-soft text-ink-body' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-[hsl(211_70%_94%)] text-[hsl(211_61%_36%)] dark:bg-[hsl(211_40%_18%)] dark:text-[hsl(211_70%_72%)]' },
  PACKED: { label: 'Packed', className: 'bg-[hsl(262_60%_95%)] text-[hsl(262_45%_42%)] dark:bg-[hsl(262_30%_20%)] dark:text-[hsl(262_70%_78%)]' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', className: 'bg-[hsl(262_60%_95%)] text-[hsl(262_45%_42%)] dark:bg-[hsl(262_30%_20%)] dark:text-[hsl(262_70%_78%)]' },
  DELIVERED: { label: 'Delivered', className: 'bg-green-soft text-green' },
  CANCELLED: { label: 'Cancelled', className: 'bg-brand-light text-brand-dark' },
};

export function OrderStatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm2 px-2 py-0.5 text-[11px] font-bold', m.className, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {m.label}
    </span>
  );
}

export const CHANNEL_META: Record<OrderChannel, { label: string; icon: LucideIcon }> = {
  STOREFRONT: { label: 'Web store', icon: Globe },
  PHONE: { label: 'Phone', icon: Phone },
  WHATSAPP: { label: 'WhatsApp', icon: MessageCircle },
  WALK_IN: { label: 'Walk-in', icon: Store },
  SALES_REP: { label: 'Sales rep', icon: UserRound },
  EMAIL: { label: 'Email', icon: Mail },
};

export function ChannelTag({ channel }: { channel: OrderChannel }) {
  const m = CHANNEL_META[channel];
  const Icon = m.icon;
  const web = channel === 'STOREFRONT';
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]', web ? 'font-bold text-[hsl(211_61%_40%)] dark:text-[hsl(211_70%_72%)]' : 'text-ink-soft')}>
      <Icon size={13} />
      {web ? 'Web store' : `Manual · ${m.label}`}
    </span>
  );
}

export const PAYMENT_LABEL: Record<string, string> = {
  CREDIT: 'Credit (on account)',
  CASH: 'Cash',
  COD: 'Cash on delivery',
  UPI: 'UPI on delivery',
  ONLINE: 'Paid online',
};

export const MANUAL_CHANNELS: OrderChannel[] = ['PHONE', 'WHATSAPP', 'WALK_IN', 'SALES_REP', 'EMAIL'];

export const DELIVERY_SLOTS = ['6–8 AM', '8–10 AM', '10 AM–12 PM', '12–2 PM', '2–4 PM', '4–6 PM', '6–8 PM', 'Customer pickup'];

/** "17 Nov, 10:42" in IST. */
export function orderWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}
