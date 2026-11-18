import Link from 'next/link';
import { Outfit } from 'next/font/google';
import {
  ArrowRight,
  Bell,
  Boxes,
  ChartColumn,
  Check,
  CupSoda,
  Download,
  History,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogIn,
  MessageCircle,
  Milk,
  Minus,
  Package,
  Play,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Snowflake,
  Store,
  Ticket,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { MODULES, type ModuleKey } from '@/lib/modules';
import { GRACE_DAYS, PLANS, PLAN_KEYS, TRIAL_DAYS } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { FeatureGallery, HowItWorks, LandingMotion, Pricing, type PricingPlan } from './landing-interactive';
import { BackToTop, CountUp, HeroParallax, Magnetic, MobileCta, StickyNav } from './landing-chrome';

// The public home page of the SaaS: an Outfit-set, light page built from
// uneven "bento" tiles. Server-rendered; the only client pieces are the
// how-it-works steps, the all-features gallery and the pricing period switch
// (landing-interactive.tsx).
// Motion is CSS (globals.css, `.landing-*`) and off under reduced motion.
//
// Plans, prices, limits, the trial and the grace period all come from
// src/lib/plans.ts and src/lib/modules.ts, so this page never drifts from
// what the product actually charges for.
//
// Outfit has no ₹ glyph (see src/app/layout.tsx), so the font stack falls
// back to the app's Geist (--font-ui) for the rupee sign.
const outfit = Outfit({ subsets: ['latin', 'latin-ext'], variable: '--font-landing', display: 'swap' });

/** Who's looking: nobody, a company user, or the platform super-admin. */
export type LandingViewer = { kind: 'guest' } | { kind: 'user'; name: string | null } | { kind: 'admin' };

// ── Data from the plan catalogue ─────────────────────────────────────────

const MODULE_COPY: Record<ModuleKey, string> = {
  inventory: 'Inventory with batches and expiry',
  purchases: 'Purchases and suppliers',
  returns: 'Returns and credit notes',
  reports: 'Reports, GSTR-1 and Tally export',
  team: 'Team logins',
  marketing: 'Coupons, discounts and schemes',
  storefront: 'Online store with delivery zones',
};
const CORE_FEATURES = ['GST invoices with e-Invoice and e-Way Bill', 'Orders, payments, dues and reminders', 'Unlimited customers and products'];

const plans = PLAN_KEYS.map((k) => PLANS[k]);
const startPrice = Math.min(...plans.map((p) => p.monthly));
const freeMonths = Math.max(0, Math.round(12 - plans[0].yearly / plans[0].monthly));
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const limit = (n: number | null, unit: string, unlimited: string) => (n === null ? unlimited : `${n.toLocaleString('en-IN')} ${unit}`);
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const plansWith = (key: ModuleKey) => joinAnd(plans.filter((p) => p.modules.includes(key)).map((p) => p.label));

function pricingPlans(): PricingPlan[] {
  return plans.map((plan, i) => {
    const prev = i > 0 ? plans[i - 1] : null;
    const added = MODULES.filter((m) => m.key !== 'team' && plan.modules.includes(m.key) && !prev?.modules.includes(m.key));
    return {
      key: plan.key,
      label: plan.label,
      blurb: plan.blurb,
      monthly: plan.monthly,
      yearly: plan.yearly,
      popular: plan.key === 'growth',
      features: [
        ...(prev ? [`Everything in ${prev.label}`] : CORE_FEATURES),
        ...added.map((m) => MODULE_COPY[m.key]),
        limit(plan.maxUsers, 'team logins', 'Unlimited team logins'),
        limit(plan.maxInvoicesPerMonth, 'invoices a month', 'Unlimited invoices'),
      ],
    };
  });
}

type Cell = { text: string; className: string };
const YES: Cell = { text: '✓', className: 'text-[#15803D]' };
const NO: Cell = { text: '—', className: 'text-[#9AA0AD]' };
const txt = (text: string): Cell => ({ text, className: 'text-[#0F1115]' });

function compareRows(): { label: string; cells: Cell[] }[] {
  return [
    { label: 'GST invoices, orders and payments', cells: plans.map(() => YES) },
    { label: 'e-Invoice and e-Way Bill', cells: plans.map(() => YES) },
    ...MODULES.filter((m) => m.key !== 'team').map((m) => ({ label: MODULE_COPY[m.key], cells: plans.map((p) => (p.modules.includes(m.key) ? YES : NO)) })),
    { label: 'Team logins', cells: plans.map((p) => txt(p.maxUsers === null ? 'Unlimited' : String(p.maxUsers))) },
    { label: 'Invoices a month', cells: plans.map((p) => txt(p.maxInvoicesPerMonth === null ? 'Unlimited' : p.maxInvoicesPerMonth.toLocaleString('en-IN'))) },
  ];
}

// ── Static copy ──────────────────────────────────────────────────────────

const NAV = [
  ['#features', 'Features'],
  ['#how', 'How it works'],
  ['#all', 'All features'],
  ['#pricing', 'Pricing'],
  ['#faq', 'FAQ'],
] as const;

const SEGMENTS: { label: string; icon: LucideIcon; color: string }[] = [
  { label: 'Ice and cold chain', icon: Snowflake, color: 'text-[#0284C7]' },
  { label: 'Dairy', icon: Milk, color: 'text-[#D97706]' },
  { label: 'FMCG', icon: Truck, color: 'text-[#2563EB]' },
  { label: 'Beverages', icon: CupSoda, color: 'text-[#DB2777]' },
  { label: 'Hardware', icon: Wrench, color: 'text-[#4B5563]' },
  { label: 'Wholesale', icon: Warehouse, color: 'text-[#059669]' },
];

const MINI_RAIL: LucideIcon[] = [LayoutDashboard, ShoppingBag, Package, Users, Boxes, Ticket, Store, ChartColumn];
const MINI_KPIS = [
  { label: 'Sales today', value: '₹1,84,320', note: '↑ 12% vs last Tue', dark: true },
  { label: 'Orders', value: '146', note: '↑ 9%' },
  { label: 'Collected', value: '₹1,12,700', note: '61% of sales' },
  { label: 'Due', value: '₹4,21,900', note: '₹82,150 overdue', warn: true },
];
const MINI_BARS = [22, 52, 77, 96, 86, 67, 59, 56, 73, 94, 80, 64, 49, 40];
const MINI_ORDERS = [
  { no: 'ORD-1053', who: 'Marina Juice Corner', status: 'To confirm', className: 'bg-[#FFF2C7] text-[#7A5300]' },
  { no: 'ORD-1050', who: 'Kovai Banquet Hall', status: 'Packed', className: 'bg-[#EDE7FF] text-[#4B2FD6]' },
  { no: 'ORD-1043', who: 'Green Leaf Juices', status: 'Delivered', className: 'bg-[#DDF7EA] text-[#0E5C3A]' },
];

// Every card: reveals on scroll, lifts on hover, and carries the pointer
// spotlight and border light (globals.css, `.landing-spot`). Dark cards set
// a lighter --spot.
const tile = 'landing-reveal landing-card landing-spot group overflow-hidden rounded-[30px] motion-safe:hover:-translate-y-1.5 hover:shadow-[0_34px_60px_-30px_rgba(15,17,21,0.5)]';
const darkSpot = '[--spot:rgba(255,255,255,0.08)]';
const iconTile = 'flex h-10 w-10 flex-none items-center justify-center rounded-[13px] transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover:-rotate-6 group-hover:scale-110';

// ── Page ─────────────────────────────────────────────────────────────────

export function LandingPage({ viewer }: { viewer: LandingViewer }) {
  const guest = viewer.kind === 'guest';
  const firstName = viewer.kind === 'user' && viewer.name ? viewer.name.split(' ')[0] : null;
  const primary =
    viewer.kind === 'admin'
      ? { href: '/admin', label: 'Open admin', short: 'Open admin' }
      : viewer.kind === 'user'
        ? { href: '/dashboard', label: 'Open dashboard', short: 'Open dashboard' }
        : { href: '/signup', label: `Start ${TRIAL_DAYS}-day free trial`, short: 'Start free trial' };
  const secondary =
    viewer.kind === 'user' ? { href: '/orders/new', label: 'New order', icon: Plus } : { href: '#how', label: 'See how it works', icon: Play };
  const pricingCta = viewer.kind === 'admin' ? { href: '/admin', label: 'Manage plans' } : viewer.kind === 'user' ? { href: '/dashboard', label: 'Open dashboard' } : { href: '/signup', label: 'Start free trial' };

  const faqs = [
    {
      q: 'How does the free trial work?',
      a: `Every plan starts with ${TRIAL_DAYS} days free. Add your company, products and customers and use everything in the plan. Choose a plan whenever you are ready; your data stays as it is.`,
    },
    {
      q: 'What happens if a payment is late?',
      a: `Your account keeps working for ${GRACE_DAYS} more days, with a reminder at the top of the screen. After that, new invoices and orders pause until the plan is renewed.`,
    },
    { q: `Does ${APP_NAME} do e-Invoice and e-Way Bill?`, a: 'Yes. The IRN, acknowledgement and signed QR come from the GST portal and print on the invoice, with the e-Way Bill alongside.' },
    {
      q: 'Can my customers order online?',
      a: `On ${plansWith('storefront')} you get your own web store link with delivery zones by PIN code. Web orders arrive in Orders for you to confirm, and shoppers can follow each order on its status page.`,
    },
    { q: 'Can I use it on my phone?', a: `Yes. ${APP_NAME} works in the browser on phone, tablet and desktop, so you can take orders and bill at the shop or on the road.` },
    { q: 'Can I take my data out?', a: `${plansWith('reports')} include reports with CSV, GSTR-1 and Tally exports, so your accountant gets exactly what they need.` },
    {
      q: 'How many people can use one account?',
      a: `${joinAnd(plans.map((p) => `${p.label} ${p.maxUsers === null ? 'unlimited' : p.maxUsers}`))} logins. Owners can add staff and see everything each person changes.`,
    },
  ];

  const accountLinks =
    viewer.kind === 'admin'
      ? [
          ['/admin', 'Admin'],
          ['/terms', 'Terms and conditions'],
        ]
      : viewer.kind === 'user'
        ? [
            ['/dashboard', 'Dashboard'],
            ['/orders', 'Orders'],
            ['/terms', 'Terms and conditions'],
          ]
        : [
            ['/signup', 'Start free trial'],
            ['/login', 'Sign in'],
            ['/forgot-password', 'Forgot password'],
            ['/terms', 'Terms and conditions'],
          ];

  return (
    <div
      className={cn(outfit.variable, 'landing min-h-screen overflow-x-clip bg-[#F3F4F7] text-[16px] leading-[1.55] text-[#3D4350] antialiased')}
      style={{ fontFamily: 'var(--font-landing), var(--font-ui), system-ui, sans-serif' }}
    >
      <LandingMotion />
      <HeroParallax />
      <StickyNav links={NAV} cta={{ href: primary.href, label: primary.short }} appName={APP_NAME} showSignIn={guest} phoneBar={guest} />
      <BackToTop />
      {guest && <MobileCta href={primary.href} label={primary.label} />}
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section data-hero className="relative isolate overflow-hidden pb-9">
        <span aria-hidden className="landing-blob absolute -left-44 -top-60 -z-20 h-[640px] w-[660px] rounded-full bg-brand opacity-25 blur-[110px]" />
        <span aria-hidden className="landing-blob landing-blob-2 absolute -right-52 -top-44 -z-20 h-[620px] w-[720px] rounded-full bg-[#A78BFA] opacity-40 blur-[120px]" />
        <span aria-hidden className="landing-blob landing-blob-3 absolute left-[30%] top-[420px] -z-20 h-[480px] w-[640px] rounded-full bg-[#7DD3FC] opacity-30 blur-[130px]" />
        <span aria-hidden className="landing-grid absolute inset-0 -z-10" />

        <header className="flex justify-center px-4 pt-5">
          <div className="flex w-full max-w-[1060px] items-center gap-x-5 rounded-full border border-[#0F1115]/[0.08] bg-white/75 py-2 pl-3 pr-2 shadow-[0_12px_34px_-20px_rgba(15,17,21,0.4)] backdrop-blur-xl">
            <Link href="/" aria-label={`${APP_NAME} home`} className="flex min-w-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/mark.png" alt="" className="h-10 w-10 flex-none object-contain" />
              <span className="truncate text-[23px] font-bold tracking-[-0.04em] text-[#0F1115]">{APP_NAME}</span>
            </Link>
            <nav aria-label="Main" className="ml-2 hidden gap-[22px] lg:flex">
              {NAV.map(([href, label]) => (
                <a key={href} href={href} className="text-[15px] font-medium text-[#3D4350] transition-colors hover:text-[#0F1115]">
                  {label}
                </a>
              ))}
            </nav>
            <span className="flex-1" />
            {guest && (
              <Link href="/login" className="hidden text-[15px] font-medium text-[#3D4350] transition-colors hover:text-[#0F1115] sm:inline">
                Sign in
              </Link>
            )}
            <Link href={primary.href} className="inline-flex h-11 flex-none items-center rounded-full bg-[#0F1115] px-5 font-semibold text-white transition hover:brightness-125">
              {primary.short}
            </Link>
          </div>
        </header>

        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-14 px-6 pt-14 lg:pt-[72px]">
          <div className="min-w-0 flex-[1_1_520px]">
            <a
              href={firstName ? '/dashboard' : '#features'}
              className="landing-rise group inline-flex max-w-full items-center gap-2.5 rounded-full border border-[#0F1115]/[0.08] bg-white/80 py-[5px] pl-[5px] pr-3.5 text-[14px] font-medium text-[#0F1115] shadow-[0_6px_18px_-12px_rgba(15,17,21,0.35)] transition-shadow hover:shadow-[0_10px_24px_-12px_rgba(15,17,21,0.45)]"
            >
              <span className="flex-none rounded-full bg-brand px-2.5 py-0.5 text-[12.5px] font-semibold text-white">{firstName ? 'Hi' : 'New'}</span>
              <span className="truncate">{firstName ? `Welcome back, ${firstName}` : 'Your own web store, with delivery zones'}</span>
              <ArrowRight size={14} className="flex-none transition-transform group-hover:translate-x-0.5" aria-hidden />
            </a>
            {/* Each word rises out of its own mask, one after another; the
                underlined phrase follows as one piece so its line isn't clipped. */}
            <h1 aria-label="Orders in. Invoices out. Money in the bank." className="mt-6 text-[length:clamp(42px,6vw,82px)] font-bold leading-[0.95] tracking-[-0.055em] text-[#0F1115]">
              {['Orders', 'in.', 'Invoices', 'out.', 'Money'].map((word, i) => (
                <span key={i} aria-hidden>
                  <span className="landing-word">
                    <span style={{ animationDelay: `${80 + i * 70}ms` }}>{word}</span>
                  </span>{' '}
                </span>
              ))}
              <span aria-hidden className="landing-rise relative inline-block text-brand" style={{ animationDelay: '470ms' }}>
                in the bank.
                <svg aria-hidden viewBox="0 0 300 16" preserveAspectRatio="none" className="absolute -bottom-3 left-0 h-4 w-full">
                  <path className="landing-draw" pathLength={1} d="M3 11 C 60 3, 120 15, 180 7 S 270 4, 297 9" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="landing-rise mt-8 max-w-[560px] text-[19px] leading-[1.55] text-[#4B5160]" style={{ animationDelay: '180ms' }}>
              GST billing for Indian distributors and wholesalers. Take orders, send invoices on WhatsApp, collect payments and run your delivery routes from one place.
            </p>
            <div className="landing-rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '270ms' }}>
              <Magnetic>
                <Link
                  href={primary.href}
                  className="landing-shine group inline-flex h-[58px] items-center gap-3 rounded-full bg-[#0F1115] pl-[26px] pr-2.5 text-[17px] font-semibold text-white shadow-[0_18px_36px_-16px_rgba(15,17,21,0.6)] transition hover:shadow-[0_24px_44px_-16px_rgba(15,17,21,0.7)]"
                >
                  {primary.label}
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand transition-transform duration-300 group-hover:rotate-[-35deg] group-hover:scale-110">
                    <ArrowRight size={16} aria-hidden />
                  </span>
                </Link>
              </Magnetic>
              <Link
                href={secondary.href}
                className="group inline-flex h-[58px] items-center gap-3 rounded-full border border-[#0F1115]/10 bg-white/70 pl-2.5 pr-6 text-[17px] font-semibold text-[#0F1115] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_36px_-20px_rgba(15,17,21,0.45)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand transition-transform duration-300 group-hover:scale-110">
                  <secondary.icon size={15} aria-hidden />
                </span>
                {secondary.label}
              </Link>
            </div>
            <ul className="landing-rise mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-[15px] text-[#4B5160]" style={{ animationDelay: '360ms' }}>
              {['GST, e-Invoice and e-Way Bill', 'Phone and desktop', `${TRIAL_DAYS}-day free trial`].map((c) => (
                <li key={c} className="inline-flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#DCFCE7] text-[#15803D]">
                    <Check size={11} strokeWidth={3.4} aria-hidden />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <HeroCollage />
        </div>

        <ProductShot />
      </section>

      {/* ── Built for (a slow, pausable marquee) ─────────────── */}
      <section aria-label="Built for" className="pb-7 pt-10">
        <div className="text-center text-[13px] font-bold uppercase tracking-[0.12em] text-[#626876]">Built for businesses that sell and deliver every day</div>
        <div className="landing-marquee-mask mt-5 overflow-hidden">
          <ul className="landing-marquee flex w-max items-center gap-x-4">
            {[...SEGMENTS, ...SEGMENTS].map((s, i) => (
              <li
                key={i}
                aria-hidden={i >= SEGMENTS.length || undefined}
                className="inline-flex items-center gap-2.5 rounded-full border border-[#E6E8EE] bg-white px-5 py-3 text-[19px] font-semibold tracking-[-0.02em] text-[#3D4350] shadow-[0_6px_18px_-14px_rgba(15,17,21,0.4)]"
              >
                <s.icon size={20} className={s.color} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Facts ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pt-3.5">
        <div className="landing-stagger grid gap-3.5 sm:grid-cols-2 lg:grid-cols-12">
          <Fact span="lg:col-span-3" big={<CountUp to={3} duration={900} />} size="text-[64px]" text="invoice templates with your logo and layout" className="border-[#E6E8EE] bg-white text-[#0F1115]" sub="text-[#626876]" />
          <Fact span="lg:col-span-4" big={<CountUp to={8} suffix=" AM" duration={1100} />} size="text-[76px]" text="summary of yesterday’s sales in your inbox" className="border-[#F6E3A6] bg-[#FFF2C7] text-[#0F1115]" sub="text-[#6B5A1E]" />
          <Fact span="lg:col-span-3" big={<CountUp to={TRIAL_DAYS} suffix=" days" />} size="text-[56px]" text="free trial on every plan" className={cn('border-[#0F1115] bg-[#0F1115] text-white', darkSpot)} sub="text-[#A9AEBB]" />
          <Fact span="lg:col-span-2" big={<CountUp to={startPrice} prefix="₹" duration={1600} />} size="text-[44px]" text="a month to start" className="border-[#F8C9D5] bg-[#FFE3EA] text-[#0F1115]" sub="text-[#6B2A3D]" />
        </div>
      </section>

      {/* ── Features bento ───────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-[1240px] scroll-mt-6 px-6 pt-28">
        <SectionHead
          eyebrow="Features"
          title="Everything a selling business runs on"
          text="Orders, GST billing, payments, stock, delivery, offers and your own web store share the same data, so nothing is typed twice."
        />
        <FeatureBento />
      </section>

      {/* ── A closer look ────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pt-28">
        <SectionHead
          eyebrow="A closer look"
          title="The three things you’ll use every day"
          text="Orders that become invoices, dues that get collected, and a web store that fills your order list for you."
        />
        <CloserLook />
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-[1240px] scroll-mt-6 px-6 pt-28">
        <SectionHead
          eyebrow="How it works"
          title="From order to paid, in four steps"
          text="Pick a step to see what happens there. Every step uses the same order, so nothing is entered twice."
        />
        <HowItWorks />
      </section>

      {/* ── All features (a sideways gallery on a dark stage) ──── */}
      <section id="all" aria-labelledby="all-title" className="scroll-mt-6 pt-28">
        <FeatureGallery />
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-[1240px] scroll-mt-6 px-6 pt-28">
        <SectionHead eyebrow="Pricing" title="Simple plans that grow with you" text={`Every plan starts with ${TRIAL_DAYS} days free. Prices in Indian rupees.`} />
        <div className="mt-8">
          <Pricing plans={pricingPlans()} ctaHref={pricingCta.href} ctaLabel={pricingCta.label} freeMonths={freeMonths} />
        </div>
        <ul className="mt-6 flex flex-wrap gap-2">
          {[`${TRIAL_DAYS}-day free trial`, 'Unlimited customers and products', 'WhatsApp and email sharing', 'Works on phone and desktop', `${GRACE_DAYS} days of grace if a payment is late`].map((x) => (
            <li key={x} className="inline-flex items-center gap-2 rounded-full border border-[#E1E3EA] bg-white px-3.5 py-1.5 text-[14px] text-[#3D4350]">
              <Check size={14} strokeWidth={2.8} className="text-[#15803D]" aria-hidden />
              {x}
            </li>
          ))}
        </ul>
        <div className="mt-6 overflow-x-auto rounded-[28px] border border-[#E6E8EE] bg-white">
          <table className="w-full min-w-[600px] border-collapse text-[15px]">
            <thead>
              <tr className="bg-[#F7F8FA]">
                <th className="px-6 py-4 text-left font-semibold text-[#0F1115]">Compare plans</th>
                {plans.map((p) => (
                  <th key={p.key} className={cn('px-3 py-4 font-semibold', p.key === 'growth' ? 'text-brand-dark' : 'text-[#0F1115]')}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareRows().map((r) => (
                <tr key={r.label}>
                  <td className="border-t border-[#F0F1F4] px-6 py-3 text-[#0F1115]">{r.label}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className={cn('border-t border-[#F0F1F4] px-3 py-3 text-center font-semibold', c.className)}>
                      {c.text === '✓' ? <span aria-label="Included">✓</span> : c.text === '—' ? <span aria-label="Not included">—</span> : c.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Trust ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pt-28">
        <div className="landing-stagger grid gap-3.5 lg:auto-rows-[minmax(190px,auto)] lg:grid-cols-12">
          <div className={cn(tile, darkSpot, 'relative isolate flex flex-col justify-between gap-5 rounded-[34px] bg-[#0F1115] bg-[radial-gradient(460px_280px_at_0%_100%,hsl(var(--brand)/0.3),transparent_70%)] p-[34px] text-[#A9AEBB] lg:[grid-column:1/span_6] lg:[grid-row:1/span_2]')}>
            <div className="text-[14px] font-semibold uppercase tracking-[0.14em] text-[#FF8A98]">Trust and control</div>
            <div>
              <h2 className="text-[length:clamp(32px,3.8vw,50px)] font-bold leading-none tracking-[-0.045em] text-white">Built to be trusted with your books</h2>
              <p className="mt-3.5 max-w-[460px] text-[17px]">Every record belongs to your company alone, so no other business on {APP_NAME} can see your sales, dues or stock.</p>
            </div>
            <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/[0.08] text-white transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
              <Lock size={26} aria-hidden />
            </span>
          </div>
          <TrustTile className="border-[#DDD5FF] bg-[#EDE7FF] lg:[grid-column:7/span_6] lg:[grid-row:1]" icon={History} fg="text-[#5B3CC4]" sub="text-[#3B3366]" title="Every change on record" text="The activity log shows who created, edited or deleted what, and when." />
          <TrustTile className="border-[#C9EFD9] bg-[#DDF7EA] lg:[grid-column:7/span_3] lg:[grid-row:2]" icon={KeyRound} fg="text-[#15803D]" sub="text-[#24563D]" title="Right access for each person" text="Owners run the business; staff get the screens they need." />
          <TrustTile className="border-[#F6E3A6] bg-[#FFF2C7] lg:[grid-column:10/span_3] lg:[grid-row:2]" icon={Download} fg="text-[#9A5B00]" sub="text-[#6B5A1E]" title="Export anytime" text="CSV, GSTR-1 and Tally files when your accountant asks." />
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-[1240px] scroll-mt-6 px-6 pt-28">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-3.5">
          <div className="lg:col-span-4">
            <div className="text-[14px] font-semibold uppercase tracking-[0.14em] text-brand-dark">FAQ</div>
            <h2 className="mt-3 text-[length:clamp(34px,4vw,52px)] font-bold leading-none tracking-[-0.05em] text-[#0F1115]">Questions, answered</h2>
            <p className="mt-4 text-[17px] text-[#626876]">The short answers to what most businesses ask before they start.</p>
          </div>
          <div className="flex flex-col gap-2.5 lg:col-span-8">
            {faqs.map((f, i) => (
              <details
                key={f.q}
                open={i === 0}
                className="landing-reveal group rounded-[22px] border border-[#E6E8EE] bg-white transition-[border-color,box-shadow] duration-300 hover:border-[#C9CCD6] hover:shadow-[0_18px_36px_-28px_rgba(15,17,21,0.45)] open:border-[#0F1115]"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3.5 px-[22px] py-[19px] [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-[17px] font-semibold tracking-[-0.01em] text-[#0F1115]">{f.q}</span>
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[11px] bg-[#F3F4F7] text-[#3D4350] transition-[transform,background-color,color] duration-300 group-hover:scale-110 group-open:rotate-180 group-open:bg-brand group-open:text-white">
                    <Plus size={15} className="group-open:hidden" aria-hidden />
                    <Minus size={15} className="hidden group-open:block" aria-hidden />
                  </span>
                </summary>
                <p className="landing-answer px-[22px] pb-5 text-[15.5px] text-[#4B5160]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Call to action ───────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pt-28">
        <div className="landing-stagger grid gap-3.5 lg:auto-rows-[minmax(150px,auto)] lg:grid-cols-12">
          <div className={cn(tile, darkSpot, 'relative isolate flex flex-col justify-center gap-5 rounded-[36px] bg-brand bg-[radial-gradient(520px_300px_at_100%_0%,rgba(255,255,255,0.26),transparent_65%)] px-8 py-12 text-white sm:px-11 lg:[grid-column:1/span_8] lg:[grid-row:1/span_2]')}>
            <span aria-hidden className="landing-dots-white absolute inset-0 -z-10" />
            <h2 className="max-w-[640px] text-[length:clamp(36px,4.8vw,66px)] font-bold leading-[0.98] tracking-[-0.05em]">
              {guest ? 'Your first invoice is a few minutes away.' : 'Today’s orders are waiting.'}
            </h2>
            <p className="max-w-[520px] text-[18px] text-white/90">
              {guest
                ? 'Add your company and a few products, take an order and send a GST invoice on WhatsApp, all in your first sitting.'
                : 'Confirm web orders, send invoices and record payments from your dashboard.'}
            </p>
            <Magnetic className="self-start">
              <Link
                href={primary.href}
                className="landing-shine group/cta inline-flex h-[58px] items-center gap-2.5 rounded-[18px] bg-white px-7 text-[17px] font-semibold text-brand-dark shadow-[0_18px_30px_-16px_rgba(0,0,0,0.4)] transition hover:shadow-[0_24px_40px_-16px_rgba(0,0,0,0.5)]"
              >
                {primary.label} <ArrowRight size={17} className="transition-transform group-hover/cta:translate-x-1" aria-hidden />
              </Link>
            </Magnetic>
          </div>
          <Link
            href={guest ? '/login' : primary.href}
            className={cn(tile, darkSpot, 'flex flex-col justify-between gap-2.5 bg-[#0F1115] p-[26px] text-[#A9AEBB] lg:[grid-column:9/span_4] lg:[grid-row:1]')}
          >
            <span className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#FF8A98]">{guest ? 'Already a customer' : 'Your workspace'}</span>
            <span className="text-[23px] font-bold leading-[1.15] tracking-[-0.03em] text-white">{guest ? 'Sign in to your company' : primary.label}</span>
            <span className="inline-flex items-center gap-2 font-semibold text-white">
              {guest ? <LogIn size={16} aria-hidden /> : null}
              {guest ? 'Sign in' : primary.short} <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </span>
          </Link>
          <div className={cn(tile, 'flex flex-col justify-center gap-2 border border-[#F6E3A6] bg-[#FFF2C7] p-[26px] lg:[grid-column:9/span_4] lg:[grid-row:2]')}>
            <span className="text-[40px] font-bold leading-none tracking-[-0.05em] text-[#0F1115]">{inr(startPrice)}</span>
            <span className="text-[15px] text-[#6B5A1E]">a month to start, after the {TRIAL_DAYS}-day free trial</span>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="mx-auto max-w-[1240px] px-6 pb-6 pt-14">
        <div className="rounded-[34px] bg-[#0F1115] px-8 pb-6 pt-11 text-[#A9AEBB] sm:px-10">
          <div className="flex flex-wrap gap-9">
            <div className="min-w-[240px] flex-[1.5_1_260px]">
              <Link href="/" className="inline-flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/mark.png" alt="" className="h-10 w-10 object-contain" />
                <span className="text-[24px] font-bold tracking-[-0.035em] text-white">{APP_NAME}</span>
              </Link>
              <p className="mt-3.5 max-w-[300px]">Vitality in invoicing. Orders, GST billing, payments, stock and delivery, made in India.</p>
            </div>
            <nav aria-label="Product" className="flex flex-[1_1_140px] flex-col gap-2.5">
              <span className="font-semibold text-white">Product</span>
              {NAV.map(([href, label]) => (
                <a key={href} href={href} className="transition-colors hover:text-white">
                  {label}
                </a>
              ))}
            </nav>
            <nav aria-label="Account" className="flex flex-[1_1_140px] flex-col gap-2.5">
              <span className="font-semibold text-white">Account</span>
              {accountLinks.map(([href, label]) => (
                <Link key={href} href={href} className="transition-colors hover:text-white">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="mt-9 flex flex-wrap justify-between gap-2.5 border-t border-[#22252D] pt-5 text-[14px]">
            <span>
              © {new Date().getFullYear()} {APP_NAME}. Made in India.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={14} aria-hidden /> Every business gets its own private workspace
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="landing-reveal grid items-end gap-4 lg:grid-cols-12 lg:gap-3.5">
      <div className="lg:col-span-7">
        <div className="text-[14px] font-semibold uppercase tracking-[0.14em] text-brand-dark">{eyebrow}</div>
        <h2 className="mt-3 text-[length:clamp(34px,4.8vw,64px)] font-bold leading-[0.98] tracking-[-0.05em] text-[#0F1115]">{title}</h2>
      </div>
      <p className="text-[18px] text-[#626876] lg:col-span-5">{text}</p>
    </div>
  );
}

function Fact({ span, big, size, text, className, sub }: { span: string; big: React.ReactNode; size: string; text: string; className: string; sub: string }) {
  return (
    <div className={cn(tile, 'flex min-h-[160px] flex-col justify-end border px-[26px] py-6', span, className)}>
      <div className={cn('font-bold leading-[0.95] tracking-[-0.05em]', size)}>{big}</div>
      <div className={cn('mt-2.5 text-[15px]', sub)}>{text}</div>
    </div>
  );
}

function TrustTile({ className, icon: Icon, fg, sub, title, text }: { className: string; icon: LucideIcon; fg: string; sub: string; title: string; text: string }) {
  return (
    <div className={cn(tile, 'flex flex-col gap-2.5 border p-[26px]', className)}>
      <span className={cn(iconTile, 'h-[42px] w-[42px] rounded-[14px] bg-white', fg)}>
        <Icon size={20} aria-hidden />
      </span>
      <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#0F1115]">{title}</h3>
      <p className={cn('text-[15px]', sub)}>{text}</p>
    </div>
  );
}

/** The tilted cards beside the hero copy. Illustrative sample data. */
function HeroCollage() {
  // Each card bobs gently on its own rhythm (the `translate` property), and on
  // hover straightens, lifts and comes to the front (the `transform` property).
  const card =
    'landing-float absolute transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:!z-10 motion-safe:hover:-translate-y-2 motion-safe:hover:rotate-0 motion-safe:hover:scale-[1.03]';
  return (
    <div
      role="img"
      aria-label="An invoice marked paid, a payment received card, an order on its way and a weekly sales chart"
      data-parallax="16"
      className="landing-rise-late relative h-[470px] min-w-0 flex-[1_1_460px] sm:h-[540px]"
    >
      <div className={cn(card, 'left-[6%] top-[38px] z-[2] w-[340px] max-w-[90%] -rotate-3 rounded-[26px] bg-white p-[22px] shadow-[0_44px_80px_-36px_rgba(15,17,21,0.45),0_0_0_1px_rgba(15,17,21,0.05)]')}>
        <div className="flex justify-between gap-2">
          <span className="text-[13px] font-bold tracking-[0.14em] text-[#0F1115]">TAX INVOICE</span>
          <span className="text-[12.5px] text-[#626876]">INV-2026-0913</span>
        </div>
        <div className="mt-3.5 text-[13px] text-[#626876]">Billed to</div>
        <div className="font-semibold text-[#0F1115]">Marina Juice Corner</div>
        <div className="mt-3 border-t border-[#F0F1F4] text-[13.5px]">
          {[
            ['Ice Cube 5kg bag × 30', '₹1,800', 'text-[#0F1115]'],
            ['Ice Cube 5kg bag × 2, free', '₹0', 'text-[#15803D]'],
            ['Crushed Ice 10kg bag × 10', '₹1,100', 'text-[#0F1115]'],
            ['Coupon ICE10', '−₹290', 'text-[#15803D]'],
            ['GST 18%', '₹469.80', 'text-[#0F1115]'],
          ].map(([k, v, c]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-[#F3F4F6] py-[7px]">
              <span>{k}</span>
              <span className={cn('font-semibold', c)}>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="font-semibold text-[#0F1115]">Total</span>
          <span className="text-[32px] font-bold tracking-[-0.045em] text-[#0F1115]">₹3,079.80</span>
        </div>
        <span className="absolute bottom-[20px] left-[28%] rotate-[-12deg] rounded-[9px] border-[2.5px] border-[#16A34A] px-3 py-0.5 font-extrabold tracking-[0.12em] text-[#16A34A]">PAID</span>
      </div>

      <div className={cn(card, 'landing-float-2 right-0 top-0 z-[3] w-[250px] rotate-[4deg] rounded-3xl bg-[#0F1115] px-[18px] py-4 text-white shadow-[0_30px_60px_-28px_rgba(15,17,21,0.7)]')}>
        <div className="flex items-center gap-2 text-[13.5px] text-[#A9AEBB]">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#22C55E] text-[#0F1115]">
            <Check size={12} strokeWidth={3.4} aria-hidden />
          </span>
          Payment received
        </div>
        <div className="mt-1.5 text-[30px] font-bold tracking-[-0.045em]">₹3,079.80</div>
        <div className="text-[13px] text-[#A9AEBB]">UPI · Marina Juice Corner · just now</div>
      </div>

      <div className={cn(card, 'landing-float-3 -bottom-4 left-0 z-[3] w-[270px] -rotate-6 rounded-3xl border border-[#E4DCFF] bg-[#F5F3FF] px-[18px] py-4 shadow-[0_30px_60px_-32px_rgba(91,60,196,0.5)]')}>
        <div className="flex justify-between gap-2">
          <span className="font-bold text-[#0F1115]">ORD-1053</span>
          <span className="rounded-full bg-[#7C3AED] px-2.5 py-px text-[12px] font-semibold text-white">On the way</span>
        </div>
        <div className="mt-3.5 flex gap-1">
          {['bg-[#7C3AED]', 'bg-[#7C3AED]', 'bg-[#7C3AED]', 'bg-[#DDD6FE]'].map((c, i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', c)} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11.5px] text-[#5B3CC4]">
          <span>Placed</span>
          <span>Packed</span>
          <span>On the way</span>
          <span>Delivered</span>
        </div>
        <div className="mt-2.5 text-[13px] text-[#4B5160]">Route 1 · arriving 11:40 am</div>
      </div>

      <div className={cn(card, 'landing-float-2 -bottom-10 right-[2%] z-[1] hidden w-[250px] rotate-[3deg] rounded-3xl bg-white px-[18px] py-4 shadow-[0_30px_60px_-30px_rgba(15,17,21,0.4),0_0_0_1px_rgba(15,17,21,0.05)] sm:block')}>
        <div className="text-[13px] text-[#626876]">Sales this week</div>
        <div className="text-[24px] font-bold tracking-[-0.045em] text-[#0F1115]">₹12,42,620</div>
        <div className="mt-2 flex h-16 items-end gap-1.5">
          {[74, 80, 70, 85, 100, 84, 86].map((h, i) => (
            <span key={i} className={cn('flex-1 rounded-md', i === 4 ? 'bg-brand' : 'bg-[#E5E7EB]')} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      <span className={cn(card, 'landing-float-3 left-0 top-[18px] z-[4] inline-flex -rotate-3 items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[13.5px] font-semibold text-[#0F1115] shadow-[0_16px_34px_-18px_rgba(15,17,21,0.5)]')}>
        <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
        Sent on WhatsApp
      </span>
    </div>
  );
}

/** A wide, tilted look at the app's home screen with floating callouts. */
function ProductShot() {
  return (
    <div data-parallax="-8" className="landing-rise-late relative mx-auto mt-16 max-w-[1240px] px-6 lg:mt-20">
      <div data-scroll-tilt className="landing-tilt rounded-[30px] border border-[#0F1115]/[0.08] bg-white/60 p-2 shadow-[0_60px_110px_-50px_rgba(15,17,21,0.5),0_0_160px_-40px_hsl(var(--brand)/0.5)] backdrop-blur">
        <div role="img" aria-label={`The ${APP_NAME} app: a home dashboard with sales, orders, collections and dues`} className="flex h-[420px] overflow-hidden rounded-[23px] bg-[#ECEEF2] text-[12px] text-[#3D4350] sm:h-[480px]">
          <div className="flex w-[52px] flex-none flex-col items-center gap-1.5 bg-[#0F1115] py-3">
            <span className="mb-2 flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-brand text-[10.5px] font-bold text-white">AB</span>
            {MINI_RAIL.map((Icon, i) => (
              <span key={i} className={cn('flex h-[30px] w-[34px] items-center justify-center rounded-[9px]', i === 1 ? 'bg-[#262B36] text-white' : 'text-[#8A92A0]')}>
                <Icon size={15} aria-hidden />
              </span>
            ))}
          </div>
          <div className="hidden w-[170px] flex-none flex-col gap-[3px] px-2 py-3.5 md:flex">
            <div className="px-2 pb-1.5 text-[14px] font-bold text-[#0F1115]">Sales</div>
            {[
              ['Orders', '1,968', true],
              ['Invoices', '412', false],
              ['Payments', '', false],
              ['Returns', '18', false],
              ['Delivery routes', '6', false],
            ].map(([label, n, on]) => (
              <span key={String(label)} className={cn('flex h-7 items-center justify-between rounded-[9px] px-2.5', on ? 'bg-white font-semibold text-[#0F1115] shadow-sm' : 'text-[#3D4350]')}>
                <span>{label}</span>
                <span className="text-[10.5px] text-[#626876]">{n}</span>
              </span>
            ))}
          </div>
          <div className="m-2 flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[16px] font-bold text-[#0F1115]">Good morning, Ritika</div>
                <div className="text-[#626876]">12 web orders are waiting to be confirmed</div>
              </div>
              <span className="whitespace-nowrap rounded-[10px] bg-brand px-3 py-1.5 font-semibold text-white">+ New order</span>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {MINI_KPIS.map((k) => (
                <div key={k.label} className={cn('rounded-[14px] border px-3 py-2.5', k.dark ? 'border-[#0F1115] bg-[#0F1115]' : 'border-[#ECEEF2] bg-white')}>
                  <div className={k.dark ? 'text-[#A9AEBB]' : 'text-[#626876]'}>{k.label}</div>
                  <div className={cn('text-[17px] font-bold tracking-[-0.02em]', k.dark ? 'text-white' : 'text-[#0F1115]')}>{k.value}</div>
                  <div className={cn('text-[11px] font-semibold', k.dark ? 'text-[#7BE0AE]' : k.warn ? 'text-[#9A5B00]' : 'text-[#15803D]')}>{k.note}</div>
                </div>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 gap-2.5">
              <div className="flex min-w-0 flex-[3] flex-col rounded-[14px] border border-[#ECEEF2] p-3">
                <div className="font-semibold text-[#0F1115]">Sales by hour, today</div>
                <div className="mt-2 flex flex-1 items-end gap-[5px]">
                  {MINI_BARS.map((h, i) => (
                    <span key={i} className={cn('landing-bar flex-1 rounded-[5px]', i === 9 ? 'bg-brand' : 'bg-brand/25')} style={{ height: `${h}%`, animationDelay: `${500 + i * 45}ms` }} />
                  ))}
                </div>
              </div>
              <div className="hidden min-w-0 flex-[2] rounded-[14px] border border-[#ECEEF2] p-3 md:block">
                <div className="mb-1 font-semibold text-[#0F1115]">Orders</div>
                {MINI_ORDERS.map((o) => (
                  <div key={o.no} className="flex items-center gap-2 border-t border-[#F0F1F4] px-0.5 py-2">
                    <span className="font-semibold text-[#0F1115]">{o.no}</span>
                    <span className="min-w-0 flex-1 truncate">{o.who}</span>
                    <span className={cn('rounded-full px-2 py-px text-[11px] font-semibold', o.className)}>{o.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Callout className="landing-float -left-1 top-[120px]" icon={Bell} tile="bg-[#FFF2C7] text-[#9A5B00]" title="12 web orders to confirm" sub="From your web store, this morning" />
      <Callout className="landing-float landing-float-3 -right-1 top-[260px]" icon={Truck} tile="bg-[#DDEFFE] text-[#1D4FB8]" title="Loading sheet ready" sub="4 vans · 56 stops" />
      <span className="landing-float landing-float-2 absolute -top-[18px] right-[90px] hidden items-center gap-2 rounded-full bg-[#0F1115] px-[15px] py-2 text-[13px] font-semibold text-white shadow-[0_18px_36px_-16px_rgba(15,17,21,0.6)] lg:inline-flex">
        <span className="h-2 w-2 rounded-full bg-[#A78BFA]" />
        e-Invoice IRN generated
      </span>
    </div>
  );
}

function Callout({ className, icon: Icon, tile: tileClass, title, sub }: { className: string; icon: LucideIcon; tile: string; title: string; sub: string }) {
  return (
    <div className={cn('absolute hidden items-center gap-2.5 rounded-[18px] bg-white py-2.5 pl-2.5 pr-4 text-[#0F1115] shadow-[0_26px_50px_-20px_rgba(15,17,21,0.45)] lg:flex', className)}>
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tileClass)}>
        <Icon size={18} aria-hidden />
      </span>
      <span>
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12.5px] text-[#626876]">{sub}</span>
      </span>
    </div>
  );
}

/** Ten tiles of uneven size; on phones they stack in reading order. */
function FeatureBento() {
  return (
    <div className="landing-stagger mt-10 grid gap-3.5 lg:auto-rows-[92px] lg:grid-cols-12">
      <article className={cn(tile, darkSpot, 'relative isolate flex flex-col gap-4 bg-[#0F1115] bg-[radial-gradient(520px_300px_at_100%_0%,hsl(var(--brand)/0.25),transparent_70%)] p-[30px] text-[#A9AEBB] lg:[grid-column:1/span_7] lg:[grid-row:1/span_4]')}>
        <span className={cn(iconTile, 'h-[46px] w-[46px] rounded-[15px] bg-brand text-white')}>
          <ShoppingBag size={22} aria-hidden />
        </span>
        <div>
          <h3 className="text-[30px] font-bold tracking-[-0.04em] text-white">Orders first. Invoices follow.</h3>
          <p className="mt-2 max-w-[520px]">Orders come from the counter, the phone or your web store. Confirm, pack and deliver, then make the GST invoice from the order in one tap.</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2.5">
          <div className="min-w-[180px] flex-1 rounded-[18px] bg-white px-4 py-3.5 text-[13.5px] text-[#3D4350]">
            <div className="flex justify-between gap-1.5">
              <span className="font-bold text-[#0F1115]">ORD-1053</span>
              <span className="rounded-full bg-[#FFF2C7] px-2.5 text-[11.5px] font-semibold text-[#7A5300]">To confirm</span>
            </div>
            <div className="mt-1.5 font-semibold text-[#0F1115]">Marina Juice Corner</div>
            <div>Cube 5 kg × 30 · Crushed × 10</div>
          </div>
          <span aria-hidden className="landing-flow relative flex h-7 w-11 flex-none items-center">
            <span className="h-[2px] w-full rounded-full bg-white/15" />
            <span className="landing-flow-dot absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_12px_2px_hsl(var(--brand)/0.7)]" />
            <ArrowRight size={18} className="absolute -right-1 text-[#6B7080] transition-colors duration-500 group-hover:text-white" />
          </span>
          <div className="min-w-[180px] flex-1 rounded-[18px] bg-brand px-4 py-3.5 text-[13.5px] text-white">
            <div className="flex justify-between gap-1.5">
              <span className="font-bold">INV-2026-0913</span>
              <span className="rounded-full bg-white/20 px-2.5 text-[11.5px] font-semibold">Paid</span>
            </div>
            <div className="mt-1 text-[26px] font-bold tracking-[-0.04em]">₹3,079.80</div>
            <div className="text-white/90">CGST and SGST · IRN on the PDF</div>
          </div>
        </div>
      </article>

      <article className={cn(tile, 'flex items-center gap-[18px] border border-[#DDD5FF] bg-[#EDE7FF] px-[26px] py-6 lg:[grid-column:8/span_5] lg:[grid-row:1/span_2]')}>
        <div className="min-w-0 flex-1">
          <span className={cn(iconTile, 'bg-white text-[#5B3CC4]')}>
            <ShieldCheck size={20} aria-hidden />
          </span>
          <h3 className="mt-3 text-[21px] font-bold tracking-[-0.03em] text-[#0F1115]">e-Invoice and e-Way Bill</h3>
          <p className="mt-1 text-[14.5px] text-[#3B3366]">IRN and signed QR from the GST portal, printed on the invoice.</p>
        </div>
        <span aria-hidden className="landing-qr h-[84px] w-[84px] flex-none rounded-xl border-[6px] border-white transition-transform duration-500 group-hover:rotate-3 group-hover:scale-110" />
      </article>

      <article className={cn(tile, 'flex flex-col gap-3 border border-[#C9EFD9] bg-[#DDF7EA] px-[26px] py-6 lg:[grid-column:8/span_5] lg:[grid-row:3/span_3]')}>
        <div className="flex items-center gap-3">
          <span className={cn(iconTile, 'bg-white text-[#15803D]')}>
            <Wallet size={20} aria-hidden />
          </span>
          <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#0F1115]">Payments and dues</h3>
        </div>
        <p className="text-[14.5px] text-[#24563D]">Cash, UPI or bank against any bill, in part or in full. Overdue bills stand out and reminders take one tap.</p>
        <div className="mt-auto rounded-[18px] bg-white px-4 py-3.5">
          <div className="flex justify-between text-[13px] text-[#626876]">
            <span>Collected this month</span>
            <span>Still due</span>
          </div>
          <div className="flex justify-between text-[20px] font-bold tracking-[-0.03em] text-[#0F1115]">
            <span>₹41,12,000</span>
            <span className="text-[#9A5B00]">₹4,21,900</span>
          </div>
          <div aria-hidden className="landing-fill mt-2.5 flex h-2.5 gap-[3px] overflow-hidden rounded-md">
            <span className="flex-[46] bg-[#15803D]" />
            <span className="flex-[34] bg-[#4BB57B]" />
            <span className="flex-[11] bg-[#A7E3C2]" />
            <span className="flex-[9] bg-[#F2B544]" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-[#3D4350]">
            {[
              ['bg-[#15803D]', 'UPI 46%'],
              ['bg-[#4BB57B]', 'Cash 34%'],
              ['bg-[#A7E3C2]', 'Bank 11%'],
              ['bg-[#F2B544]', 'Due 9%'],
            ].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-sm', c)} />
                {l}
              </span>
            ))}
          </div>
        </div>
      </article>

      <article className={cn(tile, 'flex flex-col gap-2.5 border border-[#E6E8EE] bg-white px-[26px] py-6 lg:[grid-column:1/span_4] lg:[grid-row:5/span_3]')}>
        <div className="flex items-center gap-3">
          <span className={cn(iconTile, 'bg-[#E3F5F8] text-[#0E7490]')}>
            <Boxes size={20} aria-hidden />
          </span>
          <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#0F1115]">Stock in boxes and pieces</h3>
        </div>
        <p className="text-[14.5px] text-[#626876]">Sell 1 box and 20 pieces and stock adjusts itself, with batches and reorder alerts.</p>
        <div className="mt-auto flex flex-col gap-2.5">
          {[
            ['Ice Cube 5kg bag', 'Low · 6 boxes + 34 bags', 34, 'bg-[#E3A008]', 'text-[#9A5B00]'],
            ['Crushed Ice 10kg bag', 'In stock', 72, 'bg-[#22A55B]', 'text-[#15803D]'],
          ].map(([name, tag, pct, bar, fg]) => (
            <div key={String(name)}>
              <div className="flex justify-between gap-2 text-[13px]">
                <span className="font-semibold text-[#0F1115]">{name}</span>
                <span className={cn('font-semibold', String(fg))}>{tag}</span>
              </div>
              <div className="mt-1.5 h-[7px] rounded bg-[#EEF0F3]">
                <div className={cn('landing-fill h-full rounded', String(bar))} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className={cn(tile, 'flex flex-col gap-2.5 border border-[#CFE3FB] bg-[#DDEFFE] p-6 lg:[grid-column:5/span_3] lg:[grid-row:5/span_3]')}>
        <span className={cn(iconTile, 'bg-white text-[#1D4FB8]')}>
          <Truck size={20} aria-hidden />
        </span>
        <h3 className="text-[21px] font-bold leading-[1.1] tracking-[-0.03em] text-[#0F1115]">Routes and loading sheet</h3>
        <div className="mt-auto flex flex-col gap-2">
          {[
            ['Route 1', 14, 18],
            ['Route 2', 9, 15],
            ['Route 4', 11, 11],
          ].map(([name, d, t]) => (
            <div key={String(name)}>
              <div className="flex justify-between gap-1.5 text-[12.5px] text-[#1E3A6B]">
                <span className="font-semibold">{name}</span>
                <span>{d === t ? 'Done' : `${d}/${t}`}</span>
              </div>
              <div className="mt-1 h-[7px] rounded bg-white/80">
                <div className={cn('landing-fill h-full rounded', d === t ? 'bg-[#15803D]' : 'bg-[#1D4FB8]')} style={{ width: `${Math.round((Number(d) / Number(t)) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className={cn(tile, 'flex flex-wrap items-center gap-4 border border-[#F8C9D5] bg-[#FFE3EA] px-[26px] py-[22px] lg:[grid-column:8/span_5] lg:[grid-row:6/span_2]')}>
        <div className="min-w-0 flex-[1_1_180px]">
          <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#0F1115]">Coupons and schemes</h3>
          <p className="mt-1 text-[14.5px] text-[#6B2A3D]">Codes, automatic discounts, Buy X get Y and customer prices.</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2.5 rounded-[14px] border-2 border-dashed border-brand bg-white px-3.5 py-2">
            <span className="text-[18px] font-bold tracking-[0.02em] text-brand-dark">ICE10</span>
            <span className="text-[13px] text-[#3D4350]">10% off ice</span>
          </span>
          <span className="self-start rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-[#15803D]">Buy 25 bags, get 2 free</span>
        </div>
      </article>

      <article className={cn(tile, 'flex flex-col gap-3 border border-[#E6E8EE] bg-white p-[26px] lg:[grid-column:1/span_5] lg:[grid-row:8/span_4]')}>
        <div className="flex items-center gap-3">
          <span className={cn(iconTile, 'bg-brand/10 text-brand')}>
            <Store size={20} aria-hidden />
          </span>
          <h3 className="text-[23px] font-bold tracking-[-0.035em] text-[#0F1115]">Your own web store</h3>
        </div>
        <p className="text-[15px] text-[#626876]">One link to your catalog at each customer’s prices. Delivery zones by PIN code, a status page for every order, and web orders land in Orders for you to confirm.</p>
        <div className="mt-auto grid grid-cols-3 gap-2">
          {[
            ['Ice Cube 5kg', '₹60', 'bg-[#EDE7FF] text-[#5B3CC4]'],
            ['Crushed 10kg', '₹110', 'bg-[#DDEFFE] text-[#1D4FB8]'],
            ['Block 25kg', '₹160', 'bg-[#DDF7EA] text-[#15803D]'],
          ].map(([name, price, c]) => (
            <div key={name} className="rounded-2xl border border-[#ECEEF2] p-2">
              <div className={cn('flex h-16 items-center justify-center rounded-xl', c)}>
                <Package size={24} aria-hidden />
              </div>
              <div className="mt-1.5 text-[13px] font-semibold text-[#0F1115]">{name}</div>
              <div className="mt-0.5 flex items-center justify-between text-[13px]">
                <span>{price}</span>
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand font-bold text-white">+</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 text-[13px] font-semibold">
          <span className="rounded-full bg-[#DDF7EA] px-3 py-1 text-[#0E5C3A]">Delivery zones by PIN code</span>
          <span className="rounded-full bg-[#DDEFFE] px-3 py-1 text-[#1D4FB8]">Delivery slots</span>
        </div>
      </article>

      <article className={cn(tile, 'flex flex-col gap-2 border border-[#F6E3A6] bg-[#FFF2C7] px-6 py-[22px] lg:[grid-column:6/span_4] lg:[grid-row:8/span_2]')}>
        <div className="flex items-center gap-2.5">
          <ChartColumn size={22} className="text-[#9A5B00]" aria-hidden />
          <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#0F1115]">Reports and GSTR-1</h3>
        </div>
        <p className="text-[14.5px] text-[#6B5A1E]">Sales, dues, stock and margin, plus files for your accountant.</p>
        <div className="mt-auto flex flex-wrap gap-1.5">
          {['GSTR-1', 'Tally', 'CSV', 'Monthly PDF'].map((x) => (
            <span key={x} className="rounded-full bg-white px-3 py-0.5 text-[13px] font-semibold text-[#0F1115]">
              {x}
            </span>
          ))}
        </div>
      </article>

      <article className={cn(tile, darkSpot, 'flex flex-col gap-3 bg-brand p-6 text-white lg:[grid-column:10/span_3] lg:[grid-row:8/span_4]')}>
        <span className={cn(iconTile, 'bg-white/20')}>
          <MessageCircle size={20} aria-hidden />
        </span>
        <h3 className="text-[23px] font-bold leading-[1.08] tracking-[-0.035em]">Share in one tap</h3>
        <p className="text-[14.5px] text-white/90">The invoice PDF on WhatsApp or email, with a UPI link.</p>
        <div className="mt-auto rounded-[16px_16px_4px_16px] bg-white p-2.5 text-[13px] text-[#0F1115]">
          <div className="flex items-center gap-2 rounded-[10px] bg-[#F3F4F7] p-2">
            <span className="flex h-8 w-7 flex-none items-center justify-center rounded-md bg-[#DC2626] text-[9.5px] font-bold text-white">PDF</span>
            <span className="min-w-0">
              <span className="block font-semibold">INV-2026-0913</span>
              <span className="block text-[11.5px] text-[#626876]">Tax invoice</span>
            </span>
          </div>
          <div className="mt-1.5">Here is your invoice for ₹3,079.80. Pay by UPI from the link.</div>
        </div>
      </article>

      <article className={cn(tile, 'flex flex-col gap-2.5 border border-[#E6E8EE] bg-white px-6 py-[22px] lg:[grid-column:6/span_4] lg:[grid-row:10/span_2]')}>
        <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#0F1115]">Team, activity and alerts</h3>
        <p className="text-[14.5px] text-[#626876]">Owner and staff logins, a log of every change, and a bell for overdue bills.</p>
        <div className="mt-auto flex items-center">
          {[
            ['RK', 'bg-[#FFE4CC] text-[#9A4A00]'],
            ['KA', 'bg-[#E2EBFE] text-[#1945B8]'],
            ['SE', 'bg-[#DDF7EA] text-[#0E5C3A]'],
            ['AR', 'bg-[#EDE7FF] text-[#4B2FD6]'],
          ].map(([i, c]) => (
            <span key={i} className={cn('-mr-2 flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-white text-[12px] font-bold', c)}>
              {i}
            </span>
          ))}
          <span className="ml-[18px] text-[13.5px] text-[#626876]">Owner and staff, each with their own login</span>
        </div>
      </article>
    </div>
  );
}

/** Three alternating rows, each a closer look at a daily job. */
function CloserLook() {
  return (
    <div className="mt-16 flex flex-col gap-24">
      <CloserRow
        n="01"
        badge="bg-brand/10 text-brand-dark"
        tick="text-brand"
        title="Orders turn into invoices in one tap"
        text="Orders come from the counter, the phone or your web store. When they are ready, the GST invoice is made from the order with the same items, prices and offers."
        points={['Counter, phone and web store orders in one list', 'Schemes, coupons and customer prices apply on their own', 'e-Invoice IRN and signed QR on the PDF']}
        panel="border-brand/20 bg-[linear-gradient(150deg,hsl(var(--brand)/0.1),#FFFFFF_72%)]"
      >
        <div className="flex flex-col items-center gap-3.5">
          <div className="w-full max-w-[390px] rounded-[22px] bg-white px-5 py-[18px] shadow-[0_24px_50px_-30px_rgba(15,17,21,0.4)]">
            <div className="flex justify-between gap-2">
              <span className="font-bold text-[#0F1115]">ORD-1053 · Marina Juice Corner</span>
              <span className="rounded-full bg-[#DBEAFE] px-2.5 text-[12.5px] font-semibold text-[#1D4ED8]">Confirmed</span>
            </div>
            <div className="mt-2.5 flex flex-col gap-1 text-[14px]">
              <span>
                Ice Cube 5kg bag × 30 <span className="font-semibold text-[#15803D]">+ 2 free</span>
              </span>
              <span>Crushed Ice 10kg bag × 10</span>
              <span>Coupon ICE10 applied</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand px-[18px] py-2 font-semibold text-white shadow-[0_14px_28px_-14px_hsl(var(--brand)/0.6)]">
            <ArrowRight size={15} className="rotate-90" aria-hidden /> Generate invoice
          </span>
          <div className="w-full max-w-[390px] rounded-[22px] bg-[#0F1115] px-5 py-[18px] text-[#A9AEBB] shadow-[0_24px_50px_-24px_rgba(15,17,21,0.6)]">
            <div className="flex justify-between gap-2">
              <span className="font-bold text-white">INV-2026-0913</span>
              <span className="text-[13px]">CGST + SGST</span>
            </div>
            <div className="mt-1 text-[34px] font-bold tracking-[-0.045em] text-white">₹3,079.80</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12.5px] font-semibold">
              <span className="rounded-full bg-[#A78BFA]/20 px-2.5 py-0.5 text-[#C4B5FD]">IRN generated</span>
              <span className="rounded-full bg-[#22C55E]/15 px-2.5 py-0.5 text-[#86EFAC]">Sent on WhatsApp</span>
            </div>
          </div>
        </div>
      </CloserRow>

      <CloserRow
        n="02"
        reverse
        badge="bg-[#DCFCE7] text-[#15803D]"
        tick="text-[#16A34A]"
        title="Know who owes you, and get paid sooner"
        text="Record cash, UPI or bank against any bill. Overdue dues stand out, reminders go in one tap, and statements are ready for any dates."
        points={['Part payments and full payments', 'Overdue bills flagged with days late', 'Reminders on WhatsApp in one tap']}
        panel="border-[#D1F2DD] bg-[linear-gradient(150deg,#E8F9EE,#FFFFFF_72%)]"
      >
        <div className="mx-auto max-w-[430px] rounded-3xl bg-white p-5 shadow-[0_24px_50px_-30px_rgba(15,17,21,0.4)]">
          <div className="flex items-end justify-between gap-2">
            <span>
              <span className="block text-[13px] text-[#626876]">Collected today</span>
              <span className="text-[30px] font-bold tracking-[-0.045em] text-[#0F1115]">₹1,12,700</span>
            </span>
            <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[12.5px] font-semibold text-[#15803D]">61% of today’s sales</span>
          </div>
          <div className="my-3 h-2 rounded bg-[#F0F1F4]">
            <div className="landing-fill h-full w-[61%] rounded bg-[#22C55E]" />
          </div>
          {[
            ['KB', 'Kovai Banquet Hall', '12 days overdue', 'text-[#B45309]', '₹7,200', 'bg-[#FEF3C7] text-[#92400E]'],
            ['HA', 'Hotel Annapoorna', 'Due today', 'text-[#1D4ED8]', '₹18,640', 'bg-[#DBEAFE] text-[#1E40AF]'],
            ['SC', 'Sunrise Catering', '5 days overdue', 'text-[#B45309]', '₹2,700', 'bg-[#FCE7F3] text-[#9D174D]'],
            ['DB', 'Deccan Beverages', 'Due in 3 days', 'text-[#4B5563]', '₹13,680', 'bg-[#E0E7FF] text-[#3730A3]'],
          ].map(([i, name, tag, tagC, amt, av]) => (
            <div key={name} className="flex items-center gap-2.5 border-t border-[#F3F4F6] py-2.5">
              <span className={cn('flex h-9 w-9 flex-none items-center justify-center rounded-full text-[12.5px] font-bold', av)}>{i}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-[#0F1115]">{name}</span>
                <span className={cn('text-[12.5px] font-semibold', tagC)}>{tag}</span>
              </span>
              <span className="font-bold text-[#0F1115]">{amt}</span>
              <span className="rounded-full bg-[#0F1115] px-3 py-1 text-[12.5px] font-semibold text-white">Remind</span>
            </div>
          ))}
        </div>
      </CloserRow>

      <CloserRow
        n="03"
        badge="bg-[#E0E7FF] text-[#4338CA]"
        tick="text-[#4F46E5]"
        title="Your own web store, on every phone"
        text={`Share one link. Customers order from your catalog at their own prices and pick a delivery slot, and the order lands in ${APP_NAME} for you to confirm.`}
        points={['Delivery zones by PIN code and time slots', 'Order status page for every shopper', 'Show or hide any product']}
        panel="relative border-[#DCE1FF] bg-[linear-gradient(150deg,#EEF0FF,#FFFFFF_72%)]"
      >
        <div className="flex justify-center">
          <div role="img" aria-label="The web store on a phone with products and a cart" className="w-64 rounded-[44px] border-[10px] border-[#0F1115] bg-white px-3 pb-3 pt-3.5 shadow-[0_40px_70px_-34px_rgba(15,17,21,0.6)]">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-brand text-[10.5px] font-bold text-white">AB</span>
              <span className="text-[13.5px] font-bold text-[#0F1115]">Arctic Blocks</span>
            </div>
            <div className="mt-2.5 rounded-[10px] bg-[#F3F4F6] px-2.5 py-1.5 text-[12px] text-[#626876]">Search ice, blocks, dry ice</div>
            <div className="mt-2 flex gap-1 text-[11px] font-semibold">
              <span className="rounded-full bg-[#0F1115] px-2 py-0.5 text-white">All</span>
              <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5">Cube</span>
              <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5">Block</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-[7px]">
              {[
                ['Ice Cube 5kg', '₹60', 'bg-[#EDE9FE]'],
                ['Crushed 10kg', '₹110', 'bg-[#DBEAFE]'],
                ['Block 25kg', '₹160', 'bg-[#CFFAFE]'],
                ['Dry ice 1kg', '₹240', 'bg-[#F3F4F6]'],
              ].map(([name, price, bg]) => (
                <div key={name} className="rounded-xl bg-[#F9FAFB] p-1.5">
                  <div className={cn('h-[50px] rounded-[9px]', bg)} />
                  <div className="mt-1 text-[11px] font-semibold text-[#0F1115]">{name}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px]">
                    <span>{price}</span>
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand font-bold text-white">+</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex justify-between rounded-xl bg-brand px-3 py-2 text-[12px] font-semibold text-white">
              <span>2 items · ₹170</span>
              <span>Checkout</span>
            </div>
          </div>
        </div>
        <span className="absolute right-6 top-11 hidden rotate-[4deg] rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0F1115] shadow-[0_14px_30px_-16px_rgba(15,17,21,0.45)] sm:inline-block">
          Delivers by PIN code
        </span>
        <span className="absolute bottom-[52px] left-5 hidden -rotate-[4deg] items-center gap-2 rounded-full bg-[#0F1115] px-3.5 py-2 text-[13px] font-semibold text-white sm:inline-flex">
          <span className="h-[7px] w-[7px] rounded-full bg-[#22C55E]" />
          New web order
        </span>
      </CloserRow>
    </div>
  );
}

function CloserRow({
  n,
  reverse,
  badge,
  tick,
  title,
  text,
  points,
  panel,
  children,
}: {
  n: string;
  reverse?: boolean;
  badge: string;
  tick: string;
  title: string;
  text: string;
  points: string[];
  panel: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-10 lg:gap-14', reverse ? 'lg:flex-row-reverse' : 'lg:flex-row')}>
      <div className="landing-reveal w-full lg:flex-[1_1_0]">
        <span className={cn('inline-flex h-[50px] w-[50px] items-center justify-center rounded-2xl text-[17px] font-bold', badge)}>{n}</span>
        <h3 className="mt-5 text-[length:clamp(30px,3.2vw,44px)] font-bold leading-[1.02] tracking-[-0.045em] text-[#0F1115]">{title}</h3>
        <p className="mt-4 text-[17px] text-[#4B5160]">{text}</p>
        <ul className="mt-5 flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2.5 font-medium text-[#0F1115]">
              <Check size={18} strokeWidth={2.6} className={cn('flex-none', tick)} aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div
        className={cn(
          'landing-reveal landing-card landing-spot group w-full rounded-[36px] border px-7 py-10 hover:shadow-[0_40px_70px_-40px_rgba(15,17,21,0.45)] lg:flex-[1.15_1_0]',
          panel
        )}
        style={{ ['--d' as string]: '120ms' }}
      >
        {children}
      </div>
    </div>
  );
}
