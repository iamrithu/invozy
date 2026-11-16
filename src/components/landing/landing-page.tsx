import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileSpreadsheet,
  IndianRupee,
  LayoutDashboard,
  LogIn,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  QrCode,
  Receipt,
  Route,
  Ruler,
  ScrollText,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Sunrise,
  Truck,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';

/** Who's looking: nobody, a company user, or the platform super-admin. */
export type LandingViewer = { kind: 'guest' } | { kind: 'user'; name: string | null } | { kind: 'admin' };

// The public home page of the SaaS. Server-rendered, no client JavaScript of its own:
// the motion is CSS (globals.css, `.landing`), with scroll reveals only
// where the browser supports scroll-driven animations and nothing at all
// under prefers-reduced-motion. Paper-white invoice mock-ups stay white in
// dark mode, like the PDFs they show.

// Kulfi flavours as the accent set — decoration only, never data.
const FLAVOUR = {
  strawberry: { chip: 'bg-[#fde2ea] text-[#be185d] dark:bg-[#be185d]/20 dark:text-[#f9a8c4]', dot: '#ec4899' },
  mango: { chip: 'bg-[#fff1cc] text-[#b45309] dark:bg-[#b45309]/25 dark:text-[#fcd34d]', dot: '#f59e0b' },
  pista: { chip: 'bg-[#e3f5d8] text-[#3f7d1c] dark:bg-[#3f7d1c]/25 dark:text-[#a7e08a]', dot: '#65a30d' },
  berry: { chip: 'bg-brand-light text-brand-dark dark:text-brand', dot: 'hsl(var(--brand))' },
  blueberry: { chip: 'bg-[#e0e9ff] text-[#3647b8] dark:bg-[#3647b8]/25 dark:text-[#a9b8ff]', dot: '#4f63e0' },
} as const;
type Flavour = keyof typeof FLAVOUR;

export function LandingPage({ viewer }: { viewer: LandingViewer }) {
  const signedIn = viewer.kind !== 'guest';
  const userName = viewer.kind === 'user' ? viewer.name : null;
  const primary =
    viewer.kind === 'admin'
      ? { href: '/admin', label: 'Open admin', icon: ShieldCheck }
      : viewer.kind === 'user'
        ? { href: '/dashboard', label: 'Open dashboard', icon: LayoutDashboard }
        : { href: '/signup', label: 'Start free', icon: Sparkles };

  return (
    <div className="landing min-h-screen overflow-x-clip bg-bg text-ink-body">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${APP_NAME} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-10 w-10 flex-none object-contain" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[16px] font-bold tracking-wide text-ink">{APP_NAME}</span>
              <span className="block truncate text-[11px] text-ink-faint">Vitality in invoicing</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 text-[13px] font-semibold text-ink-soft md:flex">
            {[
              ['#features', 'Features'],
              ['#day', 'Your day'],
              ['#dashboard', 'Dashboard'],
              ['#start', 'Pricing'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-md px-3 py-2 transition-colors hover:bg-surface-alt hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          {!signedIn && (
            <Link href="/login" className="ml-auto hidden h-10 flex-none items-center gap-2 rounded-md px-3 text-[13.5px] font-bold text-ink-body transition-colors hover:bg-surface-alt sm:inline-flex md:ml-2">
              <LogIn size={15} /> Sign in
            </Link>
          )}
          <Link
            href={primary.href}
            className={cn(
              'inline-flex h-10 flex-none items-center gap-2 rounded-md bg-brand px-4 text-[13.5px] font-bold text-white shadow-sm transition-colors hover:bg-brand-dark',
              signedIn ? 'ml-auto md:ml-2' : 'ml-auto sm:ml-0'
            )}
          >
            <primary.icon size={15} /> {primary.label}
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative isolate">
        <HeroBackdrop />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pb-24 lg:pt-20">
          <div className="landing-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-surface/80 px-3 py-1 text-[12px] font-bold text-brand-dark shadow-sm backdrop-blur dark:text-brand">
              <Sparkles size={13} /> {userName ? `Welcome back, ${userName.split(' ')[0]}` : 'Free while in early access'}
            </span>
            <h1 className="mt-5 text-[38px] font-bold leading-[1.05] tracking-tight text-ink sm:text-[52px] lg:text-[58px]">
              Bill every shop.
              <br />
              Track every <span className="landing-gradient-text">rupee.</span>
              <br />
              Load every route.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">
              GST billing for Indian distributors, wholesalers and retailers — invoices with e-Invoice and e-Way Bill, payments and dues, stock in boxes and pieces,
              purchases, routes and reports in one place, from the morning loading sheet to the evening collection.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={primary.href}
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-brand px-6 text-[15px] font-bold text-white shadow-[0_10px_30px_-10px_hsl(var(--brand)/0.7)] transition-all hover:-translate-y-0.5 hover:bg-brand-dark"
              >
                {primary.label} <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              {viewer.kind === 'user' ? (
                <Link href="/invoices/new" className="inline-flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 text-[15px] font-bold text-ink transition-colors hover:border-brand/50">
                  <Receipt size={17} className="text-brand" /> New invoice
                </Link>
              ) : viewer.kind === 'guest' ? (
                <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 text-[15px] font-bold text-ink transition-colors hover:border-brand/50">
                  <LogIn size={17} className="text-brand" /> Sign in
                </Link>
              ) : (
                <a href="#features" className="inline-flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 text-[15px] font-bold text-ink transition-colors hover:border-brand/50">
                  See what&apos;s inside
                </a>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-ink-soft">
              {['GST-ready invoices', 'e-Invoice (IRN) & e-Way Bill', 'UPI QR on every bill', 'Works on your phone'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-green" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* ── Marquee ─────────────────────────────────────────────── */}
      <div className="border-y border-line bg-surface/70 py-4" aria-label="Everything in the app">
        <div className="landing-marquee-mask overflow-hidden">
          <div className="landing-marquee flex w-max gap-3">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i} aria-hidden={i >= MARQUEE.length} className="flex flex-none items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-ink-body">
                <m.icon size={15} className="text-brand" /> {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <SectionHead
            kicker="Everything in one place"
            title="Built around how Indian businesses sell"
            text="Shops, routes, boxes and pieces, GST and UPI — every screen is shaped by the day-to-day of a distributor, not a generic accounting package."
          />
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Your day ────────────────────────────────────────────── */}
      <section id="day" className="relative scroll-mt-20 overflow-hidden border-y border-line bg-surface">
        <div aria-hidden className="landing-dots pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <SectionHead kicker="A day with Invozy" title="From the first email to the last rupee" text="It follows your day — and keeps the books straight while it does." />
          <ol className="mt-12 grid gap-4 md:grid-cols-5">
            {DAY.map((d, i) => (
              <li key={d.title} className="landing-reveal relative rounded-xl border border-line bg-bg p-5">
                <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg', FLAVOUR[d.flavour].chip)}>
                  <d.icon size={19} />
                </span>
                <div className="mt-4 font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{d.time}</div>
                <h3 className="mt-1 text-[15.5px] font-bold text-ink">{d.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{d.text}</p>
                {i < DAY.length - 1 && <ArrowRight aria-hidden size={18} className="absolute -right-3.5 top-9 z-10 hidden rounded-full bg-surface text-ink-faint md:block" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Dashboard showcase ──────────────────────────────────── */}
      <section id="dashboard" className="scroll-mt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-28">
          <div>
            <SectionHead
              align="left"
              kicker="Know where you stand"
              title="One dashboard, any dates"
              text="Today, this week, this month, the financial year or all time — pick the dates once and every figure and chart follows."
            />
            <ul className="mt-8 space-y-4">
              {[
                { icon: Wallet, t: 'Payments first', d: 'Total billed → paid → still owed, with overdue called out in red.' },
                { icon: BarChart3, t: 'Charts that explain', d: 'Running total against last period, how customers paid, busiest days, top products and routes.' },
                { icon: CalendarDays, t: 'Compared fairly', d: 'This month against the same days of last month — never a full month against half of one.' },
              ].map((x) => (
                <li key={x.t} className="flex gap-3.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-light text-brand-dark dark:text-brand">
                    <x.icon size={17} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold text-ink">{x.t}</span>
                    <span className="block text-[13.5px] leading-relaxed text-ink-soft">{x.d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <DashboardVisual />
        </div>
      </section>

      {/* ── Closing call ────────────────────────────────────────── */}
      <section id="start" className="scroll-mt-20 px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="landing-cta relative mx-auto max-w-6xl overflow-hidden rounded-2xl px-6 py-14 text-center text-white sm:px-12 lg:py-20">
          <div aria-hidden className="landing-dots-light pointer-events-none absolute inset-0 opacity-40" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.png" alt="" className="relative mx-auto h-20 w-20 rounded-xl bg-white object-contain p-2 shadow-lg" />
          <h2 className="relative mx-auto mt-6 max-w-2xl text-[30px] font-bold leading-tight tracking-tight sm:text-[40px]">
            {signedIn ? 'Today’s bills are waiting.' : 'Free while we’re in early access.'}
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-[15.5px] text-white/85">
            {signedIn
              ? 'Pick up where you left off.'
              : `Every feature, for your whole team. Sign up your business, add your logo and GST details, and send your first invoice in minutes. Paid plans will come later — with notice, never by surprise.`}
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href={primary.href} className="inline-flex h-12 items-center gap-2 rounded-md bg-white px-6 text-[15px] font-bold text-brand-dark shadow-lg transition-transform hover:-translate-y-0.5">
              {primary.label} <ArrowRight size={17} />
            </Link>
            {viewer.kind === 'guest' && (
              <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-md border border-white/40 px-6 text-[15px] font-bold text-white transition-colors hover:bg-white/10">
                <LogIn size={17} /> Sign in
              </Link>
            )}
            {viewer.kind === 'user' && (
              <Link href="/invoices/new" className="inline-flex h-12 items-center gap-2 rounded-md border border-white/40 px-6 text-[15px] font-bold text-white transition-colors hover:bg-white/10">
                <Receipt size={17} /> New invoice
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt={APP_NAME} className="h-12 w-auto" />
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-ink-soft">GST billing, payments, stock and reports for Indian businesses — on your phone and at your desk.</p>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Product</div>
            <ul className="mt-3 space-y-2.5 text-[13.5px] font-semibold">
              {[
                ['#features', 'Features'],
                ['#day', 'Your day'],
                ['#dashboard', 'Dashboard'],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="text-ink-body hover:text-brand">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Account</div>
            <ul className="mt-3 space-y-2.5 text-[13.5px] font-semibold">
              {(viewer.kind === 'admin'
                ? [
                    ['/admin', 'Admin'],
                    ['/terms', 'Terms & conditions'],
                  ]
                : viewer.kind === 'user'
                  ? [
                      ['/dashboard', 'Dashboard'],
                      ['/invoices', 'Invoices'],
                      ['/terms', 'Terms & conditions'],
                    ]
                  : [
                      ['/signup', 'Start free'],
                      ['/login', 'Sign in'],
                      ['/forgot-password', 'Forgot password'],
                      ['/terms', 'Terms & conditions'],
                    ]
              ).map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-ink-body hover:text-brand">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-[12px] text-ink-faint sm:px-6">
            <span>
              © {new Date().getFullYear()} {APP_NAME}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} /> Every business gets its own private workspace
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const MARQUEE: { icon: LucideIcon; label: string }[] = [
  { icon: Receipt, label: 'GST invoices' },
  { icon: FileCheck2, label: 'e-Invoice · IRN' },
  { icon: Truck, label: 'e-Way Bill' },
  { icon: QrCode, label: 'UPI QR' },
  { icon: MessageCircle, label: 'WhatsApp share' },
  { icon: Mail, label: 'Email with PDF' },
  { icon: Wallet, label: 'Payments & dues' },
  { icon: Bell, label: 'Payment reminders' },
  { icon: Boxes, label: 'Stock in boxes & pieces' },
  { icon: ShoppingCart, label: 'Purchase bills' },
  { icon: Route, label: 'Routes & loading sheet' },
  { icon: FileSpreadsheet, label: 'GSTR-1 export' },
  { icon: Undo2, label: 'Credit notes' },
  { icon: ScrollText, label: 'Customer statements' },
  { icon: Sunrise, label: '8 AM daily summary' },
  { icon: Users, label: 'Team logins' },
];

type FeatureSpec = { icon: LucideIcon; flavour: Flavour; title: string; text: string; span: string; visual?: React.ReactNode };

const FEATURES: FeatureSpec[] = [
  {
    icon: Receipt,
    flavour: 'berry',
    title: 'GST invoices, three looks',
    text: 'Clean, Classic or Modern — with your logo, HSN, CGST/SGST or IGST worked out from the shop’s state, and pages that split neatly however long the bill.',
    span: 'lg:col-span-3',
    visual: <TemplatesVisual />,
  },
  {
    icon: FileCheck2,
    flavour: 'blueberry',
    title: 'e-Invoice & e-Way Bill',
    text: 'IRN, acknowledgement and the signed QR straight from the GST portal, printed on the invoice — with the e-Way Bill page alongside.',
    span: 'lg:col-span-3',
    visual: <EinvoiceVisual />,
  },
  {
    icon: Wallet,
    flavour: 'pista',
    title: 'Payments & dues',
    text: 'Record cash, UPI or bank payments against any bill, part-paid or full. Overdue bills stand out, and reminders are one tap away.',
    span: 'lg:col-span-2',
    visual: <PaymentsVisual />,
  },
  {
    icon: Share2,
    flavour: 'strawberry',
    title: 'Share in one tap',
    text: 'Send the invoice PDF on WhatsApp or by email, or share a link the shop can open on any phone.',
    span: 'lg:col-span-2',
    visual: (
      <div className="flex flex-wrap gap-2">
        <Pill icon={MessageCircle} text="WhatsApp" className="bg-[#dcf8e3] text-[#15803d] dark:bg-[#15803d]/25 dark:text-[#86efac]" />
        <Pill icon={Mail} text="Email + PDF" />
        <Pill icon={Share2} text="Share link" />
      </div>
    ),
  },
  {
    icon: Boxes,
    flavour: 'mango',
    title: 'Stock in boxes & pieces',
    text: 'Sell 1 box + 20 pieces and stock adjusts itself. Low stock and what to reorder are flagged before you run out.',
    span: 'lg:col-span-2',
    visual: (
      <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] font-semibold">
        <span className="rounded-md border border-line bg-bg px-2.5 py-1 text-ink">1 box + 20 pc</span>
        <span className="rounded-md bg-gold-soft px-2.5 py-1 text-gold">Low stock</span>
        <span className="rounded-md bg-green-soft px-2.5 py-1 text-green">In stock</span>
      </div>
    ),
  },
  {
    icon: Route,
    flavour: 'blueberry',
    title: 'Routes & loading sheet',
    text: 'Group shops into beats. Each morning the loading sheet lists what every route or vehicle needs to load and drop, so the van leaves with the right boxes.',
    span: 'lg:col-span-3',
    visual: (
      <div className="flex flex-wrap gap-2">
        {['Route A · 14 shops', 'Route B · 9 shops', 'Route C · 11 shops'].map((r) => (
          <span key={r} className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2.5 py-1 text-[12px] font-semibold text-ink-body">
            <MapPin size={12} className="text-brand" /> {r}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: FileSpreadsheet,
    flavour: 'pista',
    title: 'Reports & GSTR-1',
    text: 'Sales, collections, receivables, stock and customer profit — and the GSTR-1 file ready for your accountant, plus a monthly report PDF.',
    span: 'lg:col-span-3',
    visual: <BarsVisual />,
  },
  {
    icon: ShoppingCart,
    flavour: 'mango',
    title: 'Purchases & margin',
    text: 'Enter supplier bills to know stock value and the gross profit on every sale.',
    span: 'lg:col-span-2',
  },
  {
    icon: Sunrise,
    flavour: 'strawberry',
    title: '8 AM summary email',
    text: 'Yesterday’s sales, collections and dues in your inbox every morning — and last month’s report on the 1st.',
    span: 'lg:col-span-2',
  },
  {
    icon: Ruler,
    flavour: 'berry',
    title: 'Your PDF, your layout',
    text: 'Margins, rows per page, row spacing and logo size — with a live preview before you save.',
    span: 'lg:col-span-2',
  },
  {
    icon: Undo2,
    flavour: 'blueberry',
    title: 'Credit notes & statements',
    text: 'Returns as proper GST credit notes against the original bill; a statement of account for any customer, any dates.',
    span: 'lg:col-span-3',
  },
  {
    icon: Users,
    flavour: 'pista',
    title: 'Team, activity & alerts',
    text: 'Owner and staff logins, a record of who changed what, and a bell for overdue bills, drafts and low stock.',
    span: 'lg:col-span-3',
  },
];

const DAY: { time: string; title: string; text: string; icon: LucideIcon; flavour: Flavour }[] = [
  { time: '8:00 am', title: 'Summary lands', text: 'Yesterday’s sales, collections and what’s due — in your inbox.', icon: Sunrise, flavour: 'mango' },
  { time: '9:00 am', title: 'Load the vans', text: 'The loading sheet lists every route’s boxes and pieces.', icon: Truck, flavour: 'blueberry' },
  { time: 'All day', title: 'Bill at the shop', text: 'A GST invoice in seconds, from phone or desk — with UPI QR.', icon: Smartphone, flavour: 'berry' },
  { time: 'On the spot', title: 'Collect & share', text: 'Record UPI or cash, send the PDF on WhatsApp.', icon: IndianRupee, flavour: 'pista' },
  { time: 'Evening', title: 'Close the day', text: 'The dashboard shows billed, paid and still owed.', icon: Moon, flavour: 'strawberry' },
];

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function SectionHead({ kicker, title, text, align = 'center' }: { kicker: string; title: string; text: string; align?: 'center' | 'left' }) {
  return (
    <div className={cn('landing-reveal', align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl')}>
      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">{kicker}</div>
      <h2 className="mt-3 text-[30px] font-bold leading-tight tracking-tight text-ink sm:text-[40px]">{title}</h2>
      <p className="mt-4 text-[15.5px] leading-relaxed text-ink-soft">{text}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, flavour, title, text, span, visual }: FeatureSpec) {
  return (
    <article
      className={cn(
        'landing-reveal group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated',
        span
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-30" style={{ background: FLAVOUR[flavour].dot }} />
      <span className={cn('inline-flex h-11 w-11 items-center justify-center rounded-lg', FLAVOUR[flavour].chip)}>
        <Icon size={20} />
      </span>
      <h3 className="mt-4 text-[17px] font-bold text-ink">{title}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{text}</p>
      {visual && <div className="mt-5">{visual}</div>}
    </article>
  );
}

function Pill({ icon: Icon, text, className }: { icon: LucideIcon; text: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-3 py-1.5 text-[12px] font-bold text-ink-body', className)}>
      <Icon size={13} /> {text}
    </span>
  );
}

/** Soft "scoops" of flavour colour behind the hero, plus a fine dot grid. */
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-brand-light/70 via-bg to-bg dark:from-brand-light/40" />
      <div className="landing-dots absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <span className="landing-blob absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#f9a8c4] opacity-40 blur-3xl dark:opacity-15" />
      <span className="landing-blob landing-blob-2 absolute right-[-6rem] top-[-4rem] h-96 w-96 rounded-full bg-[#fcd34d] opacity-40 blur-3xl dark:opacity-10" />
      <span className="landing-blob landing-blob-3 absolute bottom-0 left-1/2 h-72 w-72 rounded-full bg-[#bef264] opacity-30 blur-3xl dark:opacity-10" />
    </div>
  );
}

/** The hero's product shot: an invoice on paper with your logo, and
 * the moments around it — e-Invoice done, paid by UPI, shared on WhatsApp.
 * Sample figures, drawn in HTML so it stays sharp at any size. */
function HeroVisual() {
  const lines: [string, string, string][] = [
    ['Basmati Rice 5 kg', '4 bag', '1,920.00'],
    ['Sunflower Oil 1 L', '3 box', '1,440.00'],
    ['Toor Dal 1 kg', '2 bag', '600.00'],
    ['Tea Powder 250 g', '1 box', '240.00'],
  ];
  return (
    <div className="landing-rise-late relative mx-auto mb-10 w-full max-w-[520px] sm:mb-4" aria-hidden>
      {/* Paper */}
      <div className="relative mx-auto w-[88%] rotate-[-2.5deg] rounded-lg bg-white p-5 text-[#1f2937] shadow-[0_30px_60px_-20px_rgba(17,24,39,0.35)] ring-1 ring-black/5 sm:p-6">
        <div className="text-center text-[9px] font-semibold uppercase tracking-[0.3em] text-[#6b7280]">Tax invoice</div>
        <div className="mt-3 flex items-center gap-3 border-y border-[#e5e7eb] py-3">
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-md border border-dashed border-[#d1d5db] text-[9px] font-semibold uppercase tracking-wide text-[#9ca3af]">
            Your logo
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-[#111827]">Your Business Name</div>
            <div className="mt-1 h-1.5 w-[80%] rounded-full bg-[#e5e7eb]" />
            <div className="mt-1 h-1.5 w-[60%] rounded-full bg-[#e5e7eb]" />
          </div>
          <div className="landing-qr h-12 w-12 flex-none rounded-sm" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
          {[
            ['Invoice No.', 'INV/26-27/0142'],
            ['Date', 'Today'],
            ['Due', 'In 7 days'],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="uppercase tracking-wide text-[#9ca3af]">{k}</div>
              <div className="font-mono font-semibold text-[#111827]">{v}</div>
            </div>
          ))}
        </div>
        <table className="mt-3 w-full text-[10.5px]">
          <thead>
            <tr className="border-y border-[#d1d5db] bg-[#f9fafb] text-left text-[8.5px] uppercase tracking-wide text-[#6b7280]">
              <th className="py-1.5 pl-1.5 font-semibold">Product</th>
              <th className="py-1.5 text-right font-semibold">Qty</th>
              <th className="py-1.5 pr-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([p, q, a]) => (
              <tr key={p} className="border-b border-[#f1f5f9]">
                <td className="py-1.5 pl-1.5">{p}</td>
                <td className="py-1.5 text-right text-[#6b7280]">{q}</td>
                <td className="py-1.5 pr-1.5 text-right font-mono">₹{a}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex justify-end">
          <div className="w-[55%] space-y-1 text-[10px]">
            <div className="flex justify-between text-[#6b7280]">
              <span>Taxable value</span>
              <span className="font-mono">₹4,200.00</span>
            </div>
            <div className="flex justify-between text-[#6b7280]">
              <span>CGST + SGST</span>
              <span className="font-mono">₹231.00</span>
            </div>
            <div className="flex justify-between border-t border-[#111827] pt-1 text-[12px] font-bold text-[#111827]">
              <span>Total</span>
              <span className="font-mono">₹4,431.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating moments */}
      <div className="landing-float absolute -right-2 -top-7 hidden w-[176px] rounded-xl border border-line bg-surface p-3 shadow-elevated sm:block sm:-right-6">
        <div className="flex items-center gap-2 text-[11px] font-bold text-ink-soft">
          <FileCheck2 size={14} className="text-[#4f63e0]" /> e-Invoice
        </div>
        <div className="mt-1 text-[13px] font-bold text-ink">IRN generated</div>
        <div className="mt-1 truncate font-mono text-[10px] text-ink-faint">a91f…c07e · Ack 1123…</div>
      </div>

      <div className="landing-float landing-float-2 absolute -bottom-8 -left-1 w-[176px] rounded-xl border border-line bg-surface p-3 shadow-elevated sm:-left-6 sm:w-[190px]">
        <div className="flex items-center gap-2 text-[11px] font-bold text-ink-soft">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-soft text-green">
            <CheckCircle2 size={13} />
          </span>
          Paid by UPI
        </div>
        <div className="mt-1 font-mono text-[18px] font-bold text-ink">₹4,431.00</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt">
          <div className="landing-fill h-full w-full rounded-full bg-green" />
        </div>
      </div>

      <div className="landing-float landing-float-3 absolute -bottom-12 right-2 flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[12px] font-bold text-ink shadow-elevated sm:-bottom-5 sm:right-6">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#25d366] text-white">
          <MessageCircle size={13} />
        </span>
        Sent on WhatsApp
      </div>
    </div>
  );
}

function TemplatesVisual() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {(['Clean', 'Classic', 'Modern'] as const).map((t) => (
        <div key={t} className="rounded-lg border border-line bg-bg p-2">
          <div className="h-[86px] rounded-md bg-white p-2 ring-1 ring-black/5">
            {t === 'Clean' && (
              <div className="grid h-full content-start gap-1.5">
                <div className="mx-auto h-1 w-[40%] rounded-full bg-[#d1d5db]" />
                <div className="grid grid-cols-[14px_1fr_14px] items-center gap-1.5">
                  <span className="h-3.5 rounded-sm bg-brand/70" />
                  <span className="grid gap-1">
                    <span className="mx-auto h-1.5 w-[70%] rounded-full bg-[#6b7280]" />
                    <span className="mx-auto h-1 w-[85%] rounded-full bg-[#d1d5db]" />
                  </span>
                  <span className="h-3.5 rounded-sm bg-[#1f2937]" />
                </div>
                <span className="h-7 rounded-sm border border-[#9ca3af] bg-[#f3f4f6]" />
              </div>
            )}
            {t === 'Classic' && (
              <div className="grid h-full content-start gap-1.5">
                <span className="h-2 rounded-sm bg-[#9ca3af]" />
                <span className="flex gap-1.5">
                  <span className="h-3.5 w-3.5 rounded-sm bg-[#d1d5db]" />
                  <span className="grid flex-1 gap-1">
                    <span className="h-1 w-[70%] rounded-full bg-[#9ca3af]" />
                    <span className="h-1 w-[90%] rounded-full bg-[#d1d5db]" />
                  </span>
                </span>
                <span className="h-7 rounded-sm bg-[#e5e7eb]" />
              </div>
            )}
            {t === 'Modern' && (
              <div className="grid h-full content-start gap-1.5">
                <span className="h-2 w-[40%] rounded-full bg-brand" />
                <span className="h-1 w-[70%] rounded-full bg-[#d1d5db]" />
                <span className="h-1 w-[55%] rounded-full bg-[#d1d5db]" />
                <span className="h-8 rounded-sm bg-[#f1f5f9]" />
              </div>
            )}
          </div>
          <div className="mt-1.5 text-center text-[11.5px] font-bold text-ink-body">{t}</div>
        </div>
      ))}
    </div>
  );
}

function EinvoiceVisual() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-bg p-3">
      <div className="landing-qr h-16 w-16 flex-none rounded-md ring-4 ring-white" />
      <div className="min-w-0 space-y-1.5 font-mono text-[11px]">
        <div className="flex items-center gap-1.5 font-sans text-[12px] font-bold text-green">
          <CheckCircle2 size={14} /> Registered with the GST portal
        </div>
        <div className="truncate text-ink-soft">IRN · a91f3b…e2c07e</div>
        <div className="truncate text-ink-soft">e-Way Bill · 1810 4423 9056</div>
      </div>
    </div>
  );
}

function PaymentsVisual() {
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        <span className="landing-grow h-full rounded-l-full bg-green" style={{ width: '62%' }} />
        <span className="landing-grow h-full bg-gold" style={{ width: '24%' }} />
        <span className="landing-grow h-full rounded-r-full bg-red" style={{ width: '14%' }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green" /> Paid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gold" /> Due soon
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red" /> Overdue
        </span>
      </div>
    </div>
  );
}

function BarsVisual() {
  const bars = [38, 52, 44, 70, 58, 84, 66, 92, 76, 100, 81, 95];
  return (
    <div className="flex h-20 items-end gap-1.5 rounded-lg border border-line bg-bg px-3 pb-2 pt-3">
      {bars.map((h, i) => (
        <span key={i} className="landing-bar flex-1 rounded-t-[3px] bg-brand/80" style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

/** A dashboard in miniature — sample figures, the app's real layout. */
function DashboardVisual() {
  const points = [8, 14, 12, 22, 26, 24, 34, 40, 38, 52, 58, 66, 72, 80];
  const w = 300;
  const h = 110;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - (v / 90) * h;
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div className="landing-reveal relative" aria-hidden>
      <span className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-brand-light via-transparent to-[#fff1cc] opacity-80 blur-2xl dark:opacity-30" />
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-elevated">
        <div className="flex items-center gap-1.5 border-b border-line bg-surface-alt px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-ink-soft">
            <CalendarDays size={12} className="text-brand" /> This month
          </span>
        </div>
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Total billed', '₹3,84,200', 'text-ink'],
              ['Paid', '₹2,96,750', 'text-green'],
              ['Still owed', '₹87,450', 'text-red'],
            ].map(([k, v, c]) => (
              <div key={k} className="rounded-lg border border-line bg-bg p-3">
                <div className="text-[10.5px] font-semibold text-ink-faint">{k}</div>
                <div className={cn('mt-1 font-mono text-[14px] font-bold sm:text-[16px]', c)}>{v}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-line bg-bg p-3">
            <div className="flex items-center justify-between text-[11px] font-bold text-ink-soft">
              <span>Sales so far</span>
              <span className="rounded-full bg-green-soft px-2 py-0.5 text-[10px] text-green">▲ ahead of last month</span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-[110px] w-full overflow-visible">
              <defs>
                <linearGradient id="landing-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="hsl(var(--line))" strokeWidth="1" />
              ))}
              <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#landing-area)" />
              <path d={line} fill="none" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="landing-draw" pathLength={1} />
              <path
                d={points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v * 0.78).toFixed(1)}`).join(' ')}
                fill="none"
                stroke="hsl(var(--ink-faint))"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="4" fill="hsl(var(--brand))" stroke="hsl(var(--surface))" strokeWidth="2" />
            </svg>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line bg-bg p-3">
              <div className="text-[11px] font-bold text-ink-soft">How customers paid</div>
              <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                <span className="h-full rounded-l-full bg-[#2a78d6]" style={{ width: '54%' }} />
                <span className="h-full bg-[#eb6834]" style={{ width: '29%' }} />
                <span className="h-full rounded-r-full bg-[#1baf7a]" style={{ width: '17%' }} />
              </div>
              <div className="mt-2 flex gap-2 text-[10px] text-ink-faint">
                <span>UPI</span>
                <span>GPay</span>
                <span>Cash</span>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-bg p-3">
              <div className="text-[11px] font-bold text-ink-soft">Top routes</div>
              {[
                ['Route A', 86],
                ['Route B', 62],
                ['Route C', 41],
              ].map(([r, v]) => (
                <div key={r} className="mt-1.5 flex items-center gap-2 text-[10px] text-ink-faint">
                  <span className="w-11 flex-none">{r}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-surface-alt">
                    <span className="block h-full rounded-full bg-brand/80" style={{ width: `${v}%` }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="landing-float absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[12px] font-bold text-ink shadow-elevated sm:flex">
        <Clock size={14} className="text-brand" /> Updated as you bill
      </div>
    </div>
  );
}
