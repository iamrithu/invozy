'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeIndianRupee,
  BadgePercent,
  Bell,
  BellRing,
  Boxes,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartPie,
  Check,
  ClipboardList,
  Contact,
  CreditCard,
  Eye,
  FileSpreadsheet,
  Gift,
  History,
  Images,
  Inbox,
  KeyRound,
  Landmark,
  LayoutGrid,
  LayoutTemplate,
  Link2,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Percent,
  QrCode,
  ReceiptText,
  Route,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SquareKanban,
  Store,
  Tags,
  Ticket,
  TrendingUp,
  TriangleAlert,
  Truck,
  Undo2,
  UserCog,
  UsersRound,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RollingNumber } from './landing-chrome';

// The interactive pieces of the public landing page. Everything else on the
// page is server-rendered.

// ── Motion ───────────────────────────────────────────────────────────────

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Page-wide motion for the landing page, mounted once. Renders nothing.
 * - Scroll reveals: `.landing-reveal` elements fade and rise in as they enter
 *   the viewport. `data-motion` (page) and `data-in` (element) are only set
 *   here, so without JavaScript (or with reduced motion) everything is simply
 *   visible. They're data attributes, not classes, so a React re-render that
 *   rewrites an element's className can't drop them.
 * - Pointer spotlight: `.landing-spot` cards get --mx/--my for the glow and
 *   border light that follow the cursor (styles in globals.css).
 * - The product shot (`[data-scroll-tilt]`) leans back and straightens as
 *   it scrolls into view. */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.landing');
    if (!root) return;
    if (prefersReducedMotion()) return;

    const reveals = Array.from(root.querySelectorAll<HTMLElement>('.landing-reveal'));
    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      root.setAttribute('data-motion', '');
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute('data-in', '');
            io?.unobserve(entry.target);
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
      );
      reveals.forEach((el) => io!.observe(el));
    }

    const onPointerMove = (ev: PointerEvent) => {
      const card = (ev.target as Element | null)?.closest?.('.landing-spot') as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${ev.clientX - r.left}px`);
      card.style.setProperty('--my', `${ev.clientY - r.top}px`);
    };
    root.addEventListener('pointermove', onPointerMove, { passive: true });

    const shot = root.querySelector<HTMLElement>('[data-scroll-tilt]');
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!shot) return;
        const r = shot.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight * 0.85)));
        shot.style.setProperty('--tilt', `${((1 - progress) * 16).toFixed(2)}deg`);
      });
    };
    if (shot) {
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    return () => {
      io?.disconnect();
      root.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

// ── How it works ─────────────────────────────────────────────────────────

type StepRow = { label: string; value: string; pill?: { text: string; className: string } };
type Step = {
  title: string;
  text: string;
  icon: LucideIcon;
  tile: string;
  preview: { title: string; sub: string; rows: StepRow[]; foot: string };
};

const GREEN_PILL = 'bg-[#DDF7EA] text-[#0E5C3A]';
const AMBER_PILL = 'bg-[#FFF2C7] text-[#7A5300]';
const BLUE_PILL = 'bg-[#DDEFFE] text-[#1D4FB8]';

const STEPS: Step[] = [
  {
    title: 'Take the order',
    text: 'Counter, phone or web store. Prices, schemes and coupons apply on their own.',
    icon: ShoppingBag,
    tile: 'bg-[#FFE4CC] text-[#C2570C]',
    preview: {
      title: 'New order · ORD-1053',
      sub: 'Marina Juice Corner · taken on the phone',
      rows: [
        { label: 'Ice Cube 5kg bag × 30', value: '₹1,800', pill: { text: 'Scheme', className: GREEN_PILL } },
        { label: 'Ice Cube 5kg bag × 2, free', value: '₹0', pill: { text: 'Free', className: GREEN_PILL } },
        { label: 'Crushed Ice 10kg bag × 10', value: '₹1,100' },
        { label: 'Coupon ICE10', value: '−₹290', pill: { text: 'Applied', className: 'bg-brand/10 text-brand-dark' } },
      ],
      foot: 'Total ₹3,079.80 · 32 bags reserved from stock',
    },
  },
  {
    title: 'Pack and dispatch',
    text: 'Confirmed orders roll into the loading sheet, grouped by route.',
    icon: Truck,
    tile: 'bg-[#DDEFFE] text-[#1D4FB8]',
    preview: {
      title: 'Loading sheet · today',
      sub: '4 vans · 56 stops',
      rows: [
        { label: 'Route 1 · Marina, 18 stops', value: '412 bags', pill: { text: 'Loading', className: AMBER_PILL } },
        { label: 'Route 2 · T. Nagar, 15 stops', value: '296 bags', pill: { text: 'Ready', className: BLUE_PILL } },
        { label: 'Route 3 · OMR, 12 stops', value: '238 bags', pill: { text: 'Ready', className: BLUE_PILL } },
        { label: 'Route 4 · Porur, 11 stops', value: '184 bags', pill: { text: 'Out', className: 'bg-[#E3F5F8] text-[#0E7490]' } },
      ],
      foot: 'Printed for every driver before the vans leave',
    },
  },
  {
    title: 'Bill and share',
    text: 'The GST invoice is made from the order and sent on WhatsApp with a UPI link.',
    icon: ReceiptText,
    tile: 'bg-brand/10 text-brand',
    preview: {
      title: 'INV-2026-0913',
      sub: 'Generated from ORD-1053',
      rows: [
        { label: 'Taxable value', value: '₹2,610.00' },
        { label: 'CGST 9%', value: '₹234.90' },
        { label: 'SGST 9%', value: '₹234.90' },
        { label: 'e-Invoice IRN', value: 'Ready', pill: { text: 'Generated', className: 'bg-[#EDE7FF] text-[#4B2FD6]' } },
      ],
      foot: 'Sent on WhatsApp to the customer',
    },
  },
  {
    title: 'Collect and close the day',
    text: 'Cash, UPI or bank against any bill, and the summary in your inbox at 8 AM.',
    icon: Wallet,
    tile: 'bg-[#DDF7EA] text-[#15803D]',
    preview: {
      title: 'Today',
      sub: 'Closing summary',
      rows: [
        { label: 'Billed', value: '₹1,84,320' },
        { label: 'Collected', value: '₹1,12,700', pill: { text: 'UPI 46%', className: GREEN_PILL } },
        { label: 'Still owed', value: '₹4,21,900', pill: { text: 'Overdue ₹82,150', className: AMBER_PILL } },
        { label: 'Bills sent', value: '146' },
      ],
      foot: 'Summary email arrives at 8:00 am',
    },
  },
];

const STEP_INDENT = ['lg:ml-0', 'lg:ml-9', 'lg:ml-3', 'lg:ml-12'];
const STEP_MS = 6000;

export function HowItWorks() {
  const [active, setActive] = useState(0);
  // Steps play through on their own until the visitor picks one.
  const [auto, setAuto] = useState(true);
  const step = STEPS[active];
  const StepIcon = step.icon;

  useEffect(() => {
    if (!auto || prefersReducedMotion()) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % STEPS.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [auto]);

  return (
    <div className="mt-10 grid gap-3.5 lg:grid-cols-12">
      <div className="landing-reveal landing-spot relative isolate flex min-h-[440px] items-center justify-center overflow-hidden rounded-[34px] bg-[#0F1115] bg-[radial-gradient(520px_320px_at_100%_0%,hsl(var(--brand)/0.25),transparent_70%)] px-5 py-10 [--spot:rgba(255,255,255,0.08)] lg:col-span-7">
        <span aria-hidden className="landing-dots-dark absolute inset-0 -z-10" />
        <div key={active} aria-live="polite" className="landing-pop w-full max-w-[460px] overflow-hidden rounded-3xl bg-white shadow-[0_36px_70px_-30px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-3 border-b border-[#EEF0F3] px-5 py-[18px]">
            <span className={cn('flex h-10 w-10 flex-none items-center justify-center rounded-[13px]', step.tile)}>
              <StepIcon size={20} aria-hidden />
            </span>
            <span>
              <span className="block text-[16px] font-semibold text-[#0F1115]">{step.preview.title}</span>
              <span className="block text-[13.5px] text-[#626876]">{step.preview.sub}</span>
            </span>
          </div>
          <div className="px-5 py-1">
            {step.preview.rows.map((row) => (
              <div key={row.label} className="flex items-center gap-2.5 border-b border-[#F0F1F4] py-[11px] text-[14px] last:border-b-0">
                <span className="flex-1 text-[#3D4350]">{row.label}</span>
                {row.pill && <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold', row.pill.className)}>{row.pill.text}</span>}
                <span className="font-semibold text-[#0F1115]">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-[#F7F8FA] px-5 py-3.5 text-[14px] font-semibold text-[#0F1115]">
            <Check size={16} className="text-[#15803D]" aria-hidden /> {step.preview.foot}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Steps of the day" className="landing-stagger flex flex-col gap-3 lg:col-span-5">
        {STEPS.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setAuto(false);
                setActive(i);
              }}
              className={cn(
                'landing-reveal group relative flex items-start gap-3.5 overflow-hidden rounded-[26px] border px-5 py-5 text-left transition-[transform,box-shadow,background-color,border-color] duration-300 motion-safe:hover:-translate-y-1',
                STEP_INDENT[i],
                on
                  ? 'flex-[1.4_1_auto] border-[#0F1115] bg-[#0F1115] text-[#A9AEBB] shadow-[0_22px_40px_-24px_hsl(var(--brand)/0.6)]'
                  : 'flex-[1_1_auto] border-[#E6E8EE] bg-white text-[#626876] hover:border-[#C9CCD6] hover:shadow-[0_20px_40px_-28px_rgba(15,17,21,0.45)]'
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 flex-none items-center justify-center rounded-[14px] text-[18px] font-bold transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110',
                  on ? 'bg-brand text-white' : s.tile
                )}
              >
                {i + 1}
              </span>
              <span>
                <span className={cn('block text-[19px] font-semibold tracking-[-0.02em]', on ? 'text-white' : 'text-[#0F1115]')}>{s.title}</span>
                <span className="mt-1 block text-[14.5px]">{s.text}</span>
              </span>
              {on && auto && (
                <span
                  key={`p${active}`}
                  aria-hidden
                  className="landing-progress absolute bottom-0 left-0 h-[3px] w-full bg-brand"
                  style={{ ['--dur' as string]: `${STEP_MS}ms` }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────

export type PricingPlan = {
  key: string;
  label: string;
  blurb: string;
  monthly: number;
  yearly: number;
  features: string[];
  popular: boolean;
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function Pricing({ plans, ctaHref, ctaLabel, freeMonths }: { plans: PricingPlan[]; ctaHref: string; ctaLabel: string; freeMonths: number }) {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const yearly = cycle === 'yearly';

  return (
    <>
      <div role="group" aria-label="Billing period" className="inline-flex gap-1 rounded-2xl border border-[#E1E3EA] bg-white p-1.5">
        {(['monthly', 'yearly'] as const).map((c) => {
          const on = c === cycle;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCycle(c)}
              className={cn('inline-flex h-10 items-center gap-2 rounded-xl px-[18px] font-semibold transition-colors', on ? 'bg-[#0F1115] text-white' : 'text-[#3D4350] hover:bg-[#F3F4F7]')}
            >
              {c === 'monthly' ? 'Monthly' : 'Yearly'}
              {c === 'yearly' && freeMonths > 0 && <span className="rounded-full bg-[#DDF7EA] px-2 text-[12px] text-[#0E5C3A]">{freeMonths} months free</span>}
            </button>
          );
        })}
      </div>

      <div className="landing-stagger mt-11 flex flex-wrap items-end gap-3.5">
        {plans.map((plan) => {
          const pop = plan.popular;
          const price = yearly ? plan.yearly : plan.monthly;
          const note = yearly ? `Works out to ${inr(Math.floor(plan.yearly / 12))} a month` : freeMonths > 0 ? `Or ${inr(plan.yearly)} a year, ${freeMonths} months free` : `Or ${inr(plan.yearly)} a year`;
          return (
            <article
              key={plan.key}
              className={cn(
                'landing-reveal landing-card landing-spot flex flex-col gap-[18px] rounded-[32px] border motion-safe:hover:-translate-y-2',
                pop
                  ? 'min-h-[620px] flex-[1.35_1_340px] border-[#0F1115] bg-[#0F1115] bg-[radial-gradient(420px_260px_at_100%_0%,hsl(var(--brand)/0.25),transparent_70%)] px-9 py-[38px] shadow-[0_40px_70px_-36px_hsl(var(--brand)/0.55)] [--spot:rgba(255,255,255,0.07)] hover:shadow-[0_50px_90px_-36px_hsl(var(--brand)/0.7)]'
                  : 'min-h-[540px] flex-[1_1_280px] border-[#E6E8EE] bg-white px-7 py-[30px] hover:shadow-[0_34px_60px_-34px_rgba(15,17,21,0.45)]'
              )}
            >
              <div className="flex items-center justify-between gap-2.5">
                <h3 className={cn('text-[22px] font-bold tracking-[-0.03em]', pop ? 'text-white' : 'text-[#0F1115]')}>{plan.label}</h3>
                {pop && <span className="rounded-full bg-brand px-3 py-1 text-[13px] font-semibold text-white">Most popular</span>}
              </div>
              <p className={pop ? 'text-[#A9AEBB]' : 'text-[#626876]'}>{plan.blurb}</p>
              <div>
                <span className={cn('font-bold leading-none tracking-[-0.05em]', pop ? 'text-[68px] text-white' : 'text-[52px] text-[#0F1115]')}>
                  <RollingNumber value={price} format={inr} />
                </span>
                <span className={pop ? 'text-[#A9AEBB]' : 'text-[#626876]'}> {yearly ? '/ year' : '/ month'}</span>
                <div className={cn('mt-1.5 text-[14px]', pop ? 'text-[#A9AEBB]' : 'text-[#626876]')}>{note}</div>
              </div>
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f} className={cn('flex items-start gap-2.5', pop ? 'text-[#E5E7EC]' : 'text-[#3D4350]')}>
                    <Check size={17} strokeWidth={2.6} className={cn('mt-[3px] flex-none', pop ? 'text-brand' : 'text-[#15803D]')} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={ctaHref}
                className={cn(
                  'mt-auto flex h-[52px] items-center justify-center rounded-[17px] border text-[16px] font-semibold transition',
                  pop ? 'landing-shine border-brand bg-brand text-white hover:brightness-110' : 'border-[#DCDFE6] bg-white text-[#0F1115] hover:border-[#0F1115] hover:bg-[#0F1115] hover:text-white'
                )}
              >
                {ctaLabel}
              </Link>
            </article>
          );
        })}
      </div>
    </>
  );
}

// ── All features ─────────────────────────────────────────────────────────

type FeatureGroup = {
  title: string;
  blurb: string;
  icon: LucideIcon;
  /** Card header tint, icon and text accent, and the stage glow behind it. */
  tint: string;
  accent: string;
  glow: string;
  items: { label: string; icon: LucideIcon }[];
};

// The same groups as the app's side menu.
const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: 'Sales',
    blurb: 'Every order, from the first call to delivered.',
    icon: ShoppingBag,
    tint: '#FFE4CC',
    accent: '#C2570C',
    glow: '#FB923C',
    items: [
      { label: 'Orders from the counter, phone and web store', icon: ShoppingCart },
      { label: 'Invoices generated from orders', icon: ReceiptText },
      { label: 'Payments, receipts and part payments', icon: Wallet },
      { label: 'Returns and GST credit notes', icon: Undo2 },
      { label: 'Delivery routes and loading sheet', icon: Truck },
      { label: 'Order board from confirm to delivered', icon: SquareKanban },
    ],
  },
  {
    title: 'Catalog',
    blurb: 'What you sell, and the price each customer pays.',
    icon: LayoutGrid,
    tint: '#EDE7FF',
    accent: '#5B3CC4',
    glow: '#A78BFA',
    items: [
      { label: 'Products sold by bag, box or pallet', icon: Package },
      { label: 'Categories with images', icon: Images },
      { label: 'Price lists and customer prices', icon: Tags },
      { label: 'Show or hide each product on the store', icon: Eye },
    ],
  },
  {
    title: 'Customers',
    blurb: 'Who buys from you, and what they owe.',
    icon: Contact,
    tint: '#DDEFFE',
    accent: '#1D4FB8',
    glow: '#60A5FA',
    items: [
      { label: 'Customer groups', icon: UsersRound },
      { label: 'Credit limits and outstanding', icon: CreditCard },
      { label: 'Statements for any dates', icon: CalendarRange },
      { label: 'Payment reminders in one tap', icon: BellRing },
      { label: 'Profit by customer', icon: TrendingUp },
    ],
  },
  {
    title: 'Inventory',
    blurb: 'What is on the shelf, and what is running low.',
    icon: Warehouse,
    tint: '#DDF7EA',
    accent: '#15803D',
    glow: '#4ADE80',
    items: [
      { label: 'Stock in boxes and pieces', icon: Boxes },
      { label: 'Batches and expiry dates', icon: CalendarClock },
      { label: 'Low stock and reorder alerts', icon: TriangleAlert },
      { label: 'Purchases and supplier bills', icon: ClipboardList },
      { label: 'Stock value and gross margin', icon: ChartPie },
    ],
  },
  {
    title: 'Offers',
    blurb: 'Coupons, schemes and special prices.',
    icon: BadgePercent,
    tint: '#FFE3EA',
    accent: '#BE123C',
    glow: '#FB7185',
    items: [
      { label: 'Coupon codes', icon: Ticket },
      { label: 'Automatic discounts', icon: Percent },
      { label: 'Buy X get Y schemes', icon: Gift },
      { label: 'Customer-specific prices', icon: BadgeIndianRupee },
    ],
  },
  {
    title: 'Online store',
    blurb: 'Customers order from your own link.',
    icon: Store,
    tint: '#DCF4F8',
    accent: '#0E7490',
    glow: '#22D3EE',
    items: [
      { label: 'Your own store link', icon: Link2 },
      { label: 'Delivery zones by PIN code', icon: MapPin },
      { label: 'Order status page for shoppers', icon: PackageCheck },
      { label: 'Web orders arrive for you to confirm', icon: Inbox },
    ],
  },
  {
    title: 'GST and compliance',
    blurb: 'Tax on every bill, and files for your accountant.',
    icon: ShieldCheck,
    tint: '#FFF2C7',
    accent: '#9A5B00',
    glow: '#FBBF24',
    items: [
      { label: 'CGST and SGST, or IGST by state', icon: Landmark },
      { label: 'e-Invoice IRN and signed QR', icon: QrCode },
      { label: 'e-Way Bill', icon: Route },
      { label: 'GSTR-1 and Tally exports', icon: FileSpreadsheet },
      { label: 'Three invoice templates with your logo', icon: LayoutTemplate },
    ],
  },
  {
    title: 'Team and control',
    blurb: 'Who did what, and a summary every morning.',
    icon: UserCog,
    tint: '#EEF0F3',
    accent: '#3D4350',
    glow: '#CBD5E1',
    items: [
      { label: 'Owner and staff logins', icon: KeyRound },
      { label: 'Activity log of every change', icon: History },
      { label: 'Alerts for overdue bills and low stock', icon: Bell },
      { label: '8 AM daily summary email', icon: Mail },
      { label: 'Monthly report on the 1st', icon: CalendarDays },
    ],
  },
];

const FEATURE_TOTAL = FEATURE_GROUPS.reduce((n, g) => n + g.items.length, 0);
const pad2 = (n: number) => String(n).padStart(2, '0');
// Cards are marked with data attributes (data-seen, data-active), not classes,
// so a re-render can't drop them.
// The gallery pins (the page holds still while the cards move sideways) only
// where a whole card fits on screen; elsewhere it is a swipeable row.
const PIN_QUERY = '(min-width: 1024px) and (min-height: 740px)';

/** Small icons that bob in each card's header: where, how fast, how late. */
const FLOATERS = [
  { className: 'left-[36%] top-[56%]', duration: '3.4s', delay: '-0.6s' },
  { className: 'left-[54%] top-[24%]', duration: '4.1s', delay: '-2.2s' },
  { className: 'left-[62%] top-[58%]', duration: '3.8s', delay: '-1.4s' },
];

type GalleryMode = 'static' | 'swipe' | 'pin';

/** All features as a sideways gallery on a dark stage.
 * - 'pin' (wide, tall screens): the stage holds still while scrolling moves
 *   the row of cards sideways. The card in focus always sits in the middle
 *   of the screen, and when scrolling stops the row settles on the nearest
 *   card.
 * - 'swipe' (phones, short screens): a native sideways row with snap points.
 * - 'static' (no JavaScript yet, or reduced motion): the same row, no effects.
 * In the first two, cards turn towards the focus point, their features slide
 * in the first time they are seen, the group menu follows along, the stage
 * glow takes the colour of the group in focus, and the stage widens to the
 * screen edge while it fills the screen (styles in globals.css, `.landing-fg-*`). */
export function FeatureGallery() {
  const stageRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const distance = useRef(0);
  // Pinned mode: how far the row moves from one card to the next.
  const step = useRef(0);
  const [mode, setMode] = useState<GalleryMode>('static');
  const [active, setActive] = useState(0);
  const [pillReady, setPillReady] = useState(false);
  const pinned = mode === 'pin';
  const group = FEATURE_GROUPS[active];

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const mq = window.matchMedia(PIN_QUERY);
    const pick = () => setMode(mq.matches ? 'pin' : 'swipe');
    pick();
    mq.addEventListener('change', pick);
    return () => mq.removeEventListener('change', pick);
  }, []);

  // Scroll-driven layout and effects. Runs in every mode so the group menu
  // and progress bar follow along even without motion.
  useEffect(() => {
    const stage = stageRef.current;
    const pin = pinRef.current;
    const view = viewRef.current;
    const track = trackRef.current;
    if (!stage || !pin || !view || !track) return;
    const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-fg-card]'));
    if (!cards.length) return;
    const animated = mode !== 'static';
    let pad = 0;
    let current = -1;
    let frame = 0;
    let idle = 0;

    const measure = () => {
      if (mode !== 'pin') {
        pin.style.height = '';
        track.style.transform = '';
        track.style.paddingInline = '';
        distance.current = 0;
        step.current = 0;
        pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
        return;
      }
      // Centre stage: the padding lets the first and the last card sit in the
      // middle of the screen, so the card in focus is always centred.
      pad = Math.max(24, (view.clientWidth - cards[0].offsetWidth) / 2);
      track.style.paddingInline = `${pad}px`;
      step.current = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0;
      distance.current = step.current * (cards.length - 1);
      // One pixel of page scroll moves the row one pixel.
      pin.style.height = `${view.offsetHeight + distance.current}px`;
    };

    const update = () => {
      frame = 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const v = view.getBoundingClientRect();
      let progress = 0;
      let focus = 0;
      if (mode === 'pin') {
        const x = Math.min(distance.current, Math.max(0, -pin.getBoundingClientRect().top));
        track.style.transform = `translate3d(${-x}px, 0, 0)`;
        progress = distance.current ? x / distance.current : 0;
        focus = v.left + v.width / 2;
      } else {
        const max = track.scrollWidth - track.clientWidth;
        progress = max > 0 ? Math.min(1, track.scrollLeft / max) : 0;
        // The swipe row snaps cards to its left edge, so the focus point
        // travels from the first card's slot to the last card's slot.
        const cw = cards[0].offsetWidth;
        focus = v.left + pad + cw / 2 + progress * Math.max(0, v.width - 2 * pad - cw);
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress.toFixed(4)})`;
      let best = 0;
      let bestD = Infinity;
      cards.forEach((card, i) => {
        const r = card.getBoundingClientRect();
        const d = r.left + r.width / 2 - focus;
        if (animated) {
          const p = Math.max(-1, Math.min(1, d / (r.width * 2.4)));
          card.style.setProperty('--p', p.toFixed(3));
          card.style.setProperty('--a', Math.abs(p).toFixed(3));
        }
        if (r.left < vw && r.right > 0 && r.top < vh * 0.85 && r.bottom > vh * 0.15) card.setAttribute('data-seen', '');
        if (Math.abs(d) < bestD) {
          bestD = Math.abs(d);
          best = i;
        }
      });
      if (best !== current) {
        cards[current]?.removeAttribute('data-active');
        cards[best].setAttribute('data-active', '');
        current = best;
        setActive(best);
      }

      if (animated) {
        const s = stage.getBoundingClientRect();
        const span = vh * 0.6;
        const t = Math.max(0, Math.min(1, 1 - s.top / span, (s.bottom - vh + span) / span));
        const inset = vw >= 640 ? 24 : 12;
        stage.style.setProperty('--fg-inset', `${((1 - t) * inset).toFixed(1)}px`);
        stage.style.setProperty('--fg-radius', `${((1 - t) * 40).toFixed(1)}px`);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Pinned mode: once scrolling stops part-way between two cards, glide to
    // the nearer one so a card always comes to rest in the middle.
    const settle = () => {
      if (mode !== 'pin' || !step.current) return;
      const top = -pin.getBoundingClientRect().top;
      if (top <= 0 || top >= distance.current) return;
      const nearest = Math.round(top / step.current) * step.current;
      if (Math.abs(nearest - top) < 2) return;
      window.scrollTo({ top: window.scrollY + (nearest - top), behavior: 'smooth' });
    };
    const onWindowScroll = () => {
      schedule();
      window.clearTimeout(idle);
      idle = window.setTimeout(settle, 220);
    };
    const onResize = () => {
      measure();
      schedule();
    };
    measure();
    update();
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    window.addEventListener('resize', onResize);
    track.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(idle);
      window.removeEventListener('scroll', onWindowScroll);
      window.removeEventListener('resize', onResize);
      track.removeEventListener('scroll', schedule);
      pin.style.height = '';
      track.style.transform = '';
      track.style.paddingInline = '';
      stage.style.removeProperty('--fg-inset');
      stage.style.removeProperty('--fg-radius');
      cards.forEach((c) => {
        c.style.removeProperty('--p');
        c.style.removeProperty('--a');
        c.removeAttribute('data-active');
      });
    };
  }, [mode]);

  // The white pill slides behind the group in focus.
  useEffect(() => {
    const rail = railRef.current;
    const pill = pillRef.current;
    const btn = rail?.querySelectorAll<HTMLElement>('button')[active];
    if (!rail || !pill || !btn) return;
    const place = () => {
      pill.style.width = `${btn.offsetWidth}px`;
      pill.style.transform = `translateX(${btn.offsetLeft}px)`;
    };
    place();
    setPillReady(true);
    // Phones: keep the group in focus visible in the sideways menu.
    if (rail.scrollWidth > rail.clientWidth) {
      rail.scrollTo({ left: btn.offsetLeft - (rail.clientWidth - btn.offsetWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [active, mode]);

  // The numbers in the heading count up once they come into view.
  useEffect(() => {
    const el = statsRef.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    const nums = Array.from(el.querySelectorAll<HTMLElement>('[data-count]'));
    nums.forEach((n) => (n.textContent = '0'));
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const k = Math.min(1, (now - start) / 1400);
          const eased = 1 - Math.pow(1 - k, 3);
          nums.forEach((n) => (n.textContent = String(Math.round(Number(n.dataset.count) * eased))));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      nums.forEach((n) => (n.textContent = n.dataset.count ?? ''));
    };
  }, []);

  const go = (i: number) => {
    const track = trackRef.current;
    const pin = pinRef.current;
    const card = track?.querySelectorAll<HTMLElement>('[data-fg-card]')[i];
    if (!track || !pin || !card) return;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    if (mode === 'pin') {
      window.scrollTo({ top: pin.getBoundingClientRect().top + window.scrollY + i * step.current, behavior });
    } else {
      track.scrollTo({ left: card.offsetLeft - (parseFloat(getComputedStyle(track).paddingLeft) || 0), behavior });
    }
  };

  return (
    <div ref={stageRef} className={cn('landing-fg-stage relative isolate bg-[#0F1115] pb-14 text-[#A9AEBB]', mode !== 'static' && 'landing-fg-ready')}>
      <span aria-hidden className="landing-dots-dark absolute inset-0 -z-10" />

      <div className="mx-auto grid max-w-[1240px] items-end gap-6 px-6 pt-24 lg:grid-cols-12 lg:gap-3.5 lg:pt-28">
        <div className="landing-reveal lg:col-span-7">
          <div className="text-[14px] font-semibold uppercase tracking-[0.14em] text-[#FF8A98]">All features</div>
          <h2 id="all-title" className="mt-3 text-[length:clamp(34px,4.8vw,64px)] font-bold leading-[0.98] tracking-[-0.05em] text-white">
            Every feature, grouped the way you work
          </h2>
        </div>
        <div className="landing-reveal lg:col-span-5" style={{ ['--d' as string]: '120ms' }}>
          <p className="text-[18px]">The same groups as the side menu inside the app, so day one feels familiar.</p>
          <div ref={statsRef} className="mt-5 flex gap-9">
            {[
              [FEATURE_TOTAL, 'features'],
              [FEATURE_GROUPS.length, 'groups'],
            ].map(([n, label]) => (
              <span key={label} className="flex items-baseline gap-2">
                <span data-count={n} className="text-[44px] font-bold leading-none tracking-[-0.05em] text-white tabular-nums">
                  {n}
                </span>
                <span className="text-[15px]">{label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div ref={pinRef} className="relative">
        <div ref={viewRef} className={cn('relative', pinned ? 'sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden' : 'pt-10')}>
          {FEATURE_GROUPS.map((g, i) => (
            <span
              key={g.title}
              aria-hidden
              className={cn('landing-fg-glow pointer-events-none absolute inset-0 -z-10', i === active ? 'opacity-100' : 'opacity-0')}
              style={{ background: `radial-gradient(820px 460px at 50% 62%, ${g.glow}3d, transparent 70%)` }}
            />
          ))}
          {pinned && (
            <span
              key={`w${active}`}
              aria-hidden
              className="landing-fg-watermark pointer-events-none absolute inset-x-0 bottom-0 -z-10 translate-y-[22%] select-none whitespace-nowrap text-center font-bold leading-none tracking-[-0.06em] text-white/[0.045]"
              // Sized so the whole group name fits across the screen.
              style={{ fontSize: `min(220px, ${(92 / (group.title.length * 0.56)).toFixed(2)}vw)` }}
            >
              {group.title}
            </span>
          )}

          <div className="mx-auto flex w-full max-w-[1240px] items-center gap-4 px-6">
            <nav ref={railRef} aria-label="Feature groups" className="landing-fg-rail relative flex min-w-0 gap-1 overflow-x-auto rounded-full border border-white/[0.08] bg-white/[0.04] p-1.5">
              <span ref={pillRef} aria-hidden className={cn('landing-fg-pill absolute bottom-1.5 left-0 top-1.5 rounded-full bg-white', pillReady ? 'opacity-100' : 'opacity-0')} />
              {FEATURE_GROUPS.map((g, i) => {
                const on = i === active;
                return (
                  <button
                    key={g.title}
                    type="button"
                    aria-current={on || undefined}
                    onClick={() => go(i)}
                    className={cn(
                      'relative inline-flex h-10 flex-none items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[14px] font-semibold outline-none transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60',
                      on ? cn('text-[#0F1115]', !pillReady && 'bg-white') : 'text-[#A9AEBB] hover:text-white'
                    )}
                  >
                    <g.icon size={16} aria-hidden className="transition-colors duration-300" style={on ? { color: g.accent } : undefined} />
                    {g.title}
                  </button>
                );
              })}
            </nav>
            <span aria-hidden className="ml-auto hidden flex-none items-baseline gap-1.5 font-semibold tabular-nums sm:inline-flex">
              <span key={active} className="landing-pop text-[30px] leading-none tracking-[-0.04em] text-white">
                {pad2(active + 1)}
              </span>
              <span className="text-[15px]">/ {pad2(FEATURE_GROUPS.length)}</span>
            </span>
          </div>

          <div
            ref={trackRef}
            role={pinned ? undefined : 'region'}
            aria-label={pinned ? undefined : 'Feature groups, scroll sideways'}
            tabIndex={pinned ? undefined : 0}
            className={cn(
              'landing-fg-track relative flex items-stretch gap-5 pt-9 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30',
              // A scrolling row clips its overflow, so the swipe row gets extra
              // room underneath for the focused card's glow.
              pinned ? 'pb-9 will-change-transform' : '-mb-14 snap-x snap-mandatory overflow-x-auto pb-24'
            )}
          >
            {FEATURE_GROUPS.map((g, i) => (
              <FeatureCard key={g.title} group={g} index={i} />
            ))}
          </div>

          <div className="relative mx-auto flex w-full max-w-[1240px] items-center gap-5 px-6">
            <span className="inline-flex flex-none items-center gap-2 text-[14px] font-medium">
              {pinned ? 'Keep scrolling to move along' : mode === 'swipe' ? 'Swipe to see every group' : 'Scroll sideways to see every group'}
              <ArrowRight size={15} className="landing-fg-nudge" aria-hidden />
            </span>
            <span aria-hidden className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
              <span ref={barRef} className="absolute inset-0 origin-left rounded-full transition-colors duration-700" style={{ transform: 'scaleX(0)', backgroundColor: group.glow }} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ group: g, index }: { group: FeatureGroup; index: number }) {
  return (
    <article
      data-fg-card
      className="landing-fg-card relative flex w-[300px] flex-none snap-start flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)] sm:w-[340px] lg:w-[360px]"
      style={{ ['--fg-accent' as string]: g.accent, ['--fg-glow' as string]: `${g.glow}80` }}
    >
      <div className="relative isolate h-[136px] flex-none overflow-hidden px-5 pt-5" style={{ background: `linear-gradient(150deg, ${g.tint} 40%, #FFFFFF 150%)` }}>
        <span aria-hidden className="landing-fg-dots absolute inset-0 -z-10" />
        <span aria-hidden className="landing-fg-num absolute -bottom-7 right-1 -z-10 text-[120px] font-bold leading-none tracking-[-0.06em]">
          {pad2(index + 1)}
        </span>
        <div className="flex items-start justify-between gap-3">
          <span className="landing-fg-icon flex h-14 w-14 items-center justify-center rounded-[18px] bg-white shadow-[0_14px_28px_-14px_rgba(15,17,21,0.45)]" style={{ color: g.accent }}>
            <g.icon size={26} strokeWidth={2.1} aria-hidden />
          </span>
          <span className="rounded-full bg-white/85 px-3 py-1 text-[12.5px] font-semibold" style={{ color: g.accent }}>
            {g.items.length} features
          </span>
        </div>
        {FLOATERS.map((f, k) => {
          const Icon = g.items[k]?.icon;
          if (!Icon) return null;
          return (
            <span
              key={k}
              aria-hidden
              className={cn('landing-fg-float absolute flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_10px_20px_-10px_rgba(15,17,21,0.4)]', f.className)}
              style={{ color: g.accent, animationDuration: f.duration, animationDelay: f.delay }}
            >
              <Icon size={16} strokeWidth={2.3} />
            </span>
          );
        })}
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <h3 className="text-[23px] font-bold tracking-[-0.035em] text-[#0F1115]">{g.title}</h3>
        <p className="mt-0.5 text-[14px] text-[#626876]">{g.blurb}</p>
        <ul className="mt-3 flex flex-col gap-0.5">
          {g.items.map((item, k) => (
            <li
              key={item.label}
              className="landing-fg-item group/item flex items-center gap-3 rounded-[14px] px-1.5 py-[5px] text-[14.5px] leading-snug text-[#3D4350] hover:bg-[#F5F6F8]"
              style={{ ['--i' as string]: k }}
            >
              <span
                className="landing-fg-chip flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] group-hover/item:-rotate-6 group-hover/item:scale-110"
                style={{ background: g.tint, color: g.accent }}
              >
                <item.icon size={15} strokeWidth={2.3} aria-hidden />
              </span>
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
