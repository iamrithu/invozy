import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import clsx from 'clsx';
import {
  Receipt,
  Palette,
  ImagePlus,
  BarChart3,
  Building2,
  ArrowRight,
  Check,
  Package,
  Users,
  Tag,
  CheckCircle2,
  Compass,
  FileText,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shell/theme-toggle';

export const metadata: Metadata = { title: 'Invozy — bill in minutes, not hours' };

const TRUST_PILLS = ['GST-correct by default', 'Free to start', 'No credit card', 'Works on any device'];

// Intentionally mirrors (but doesn't share code with) the dashboard's
// GettingStarted component (src/app/(app)/dashboard/page.tsx) — this is
// public marketing copy, that's authenticated product copy; keep both in
// sync by hand if the steps ever change.
const STEPS = [
  { icon: Package, label: 'Add a product', desc: 'Your catalog — what you sell, and at what price.' },
  { icon: Users, label: 'Add a customer', desc: "Who you're billing, and their GST state." },
  { icon: Receipt, label: 'Bill in under a minute', desc: 'Pick a customer, add products, and send — GST worked out for you.' },
];

// Rotating badge colors (brand/gold/green — the app's own accent palette)
// so the grid reads more like a colorful category list than a flat wall of
// identical red icons.
const FEATURES = [
  {
    icon: Receipt,
    color: 'brand' as const,
    title: 'Bill in under a minute',
    desc: 'Pick a customer, add products, and send — CGST/SGST vs IGST worked out automatically from your customer’s GST state, every time.',
  },
  {
    icon: Tag,
    color: 'gold' as const,
    title: 'Bill anything, not just your catalog',
    desc: 'Add a one-off item on the spot, no catalog entry needed — Invozy nudges you to save it as a product if you keep billing it.',
  },
  {
    icon: Package,
    color: 'green' as const,
    title: 'A catalog that keeps up with you',
    desc: 'Photos, categories, pack quantities, live/hidden toggles — a product list that mirrors how you actually sell.',
  },
  {
    icon: Users,
    color: 'brand' as const,
    title: 'Customer profiles that remember everything',
    desc: 'Credit limits, GST state, payment terms, and full billing history — right where you need them mid-invoice.',
  },
  {
    icon: FileText,
    color: 'gold' as const,
    title: 'Invoices that look the part',
    desc: 'Your logo, a clean GST breakdown, bank details — a real document your customers take seriously, one click to print or download.',
  },
  {
    icon: BarChart3,
    color: 'green' as const,
    title: 'Reports that matter',
    desc: 'Track what’s billed, what’s collected, and who owes you — without a spreadsheet.',
  },
  {
    icon: Palette,
    color: 'brand' as const,
    title: 'Match your brand',
    desc: 'Pick any color from the wheel, not just a preset — your invoices and workspace look like yours, not a template.',
  },
  {
    icon: Compass,
    color: 'gold' as const,
    title: 'Guided from day one',
    desc: 'A step-by-step tour walks new teammates through their first invoice — no manual, no guesswork.',
  },
  {
    icon: Building2,
    color: 'green' as const,
    title: 'Your own workspace',
    desc: 'Every business gets its own isolated company — your products, customers, and invoices, never mixed with anyone else’s.',
  },
];

const BADGE_CLASSES: Record<'brand' | 'gold' | 'green', string> = {
  brand: 'bg-brand-light text-brand-dark',
  gold: 'bg-gold-soft text-gold',
  green: 'bg-green-soft text-green',
};

// The dark contrast band lower on the page — same three trust facts the
// original flat card row had, just given a stronger visual break so the
// page doesn't read as one long stack of white cards.
const WHY_INVOZY = [
  { icon: ShieldCheck, title: 'Secure by default', desc: 'Rate-limited logins and self-serve password reset.' },
  { icon: Smartphone, title: 'Works everywhere', desc: 'A full mobile layout, not a squeezed-down desktop site.' },
  { icon: ImagePlus, title: 'Command palette search', desc: 'Press ⌘K to jump to any product, customer, or invoice.' },
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.role === 'OWNER') redirect('/dashboard');
  if (session?.user?.role === 'SUPER_ADMIN') redirect('/admin');

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1140px] items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center">
            <Image src="/brand/logo.png" alt="Invozy" width={994} height={324} priority className="h-8 w-auto md:h-9" />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#how-it-works" className="text-[13px] font-bold text-ink-soft hover:text-ink">
              How it works
            </a>
            <a href="#features" className="text-[13px] font-bold text-ink-soft hover:text-ink">
              Features
            </a>
            <a href="#tour" className="text-[13px] font-bold text-ink-soft hover:text-ink">
              Guided tour
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link href="/login" className="text-[13px] font-bold text-ink-soft hover:text-ink">
              Log in
            </Link>
            <Button asChild>
              <Link href="/signup">Sign up free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — full-bleed tinted band with soft blurred color blobs behind
          the decorative invoice mock, so the fold has depth instead of
          sitting flat on the plain page background. */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-light/50 via-bg to-bg">
        <div aria-hidden className="pointer-events-none absolute -left-28 -top-28 h-[360px] w-[360px] rounded-full bg-brand/20 blur-[110px]" />
        <div aria-hidden className="pointer-events-none absolute -right-20 top-16 h-[280px] w-[280px] rounded-full bg-gold/20 blur-[100px]" />
        <div className="relative mx-auto grid max-w-[1140px] grid-cols-1 items-center gap-10 px-5 pb-14 pt-14 md:grid-cols-[1fr_420px] md:gap-8 md:pb-20 md:pt-20">
          <div className="text-center md:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-brand">
              GST billing, simplified
            </span>
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.1] text-ink md:text-[52px]">Bill in minutes, not hours</h1>
            <p className="mx-auto mt-4 max-w-[480px] text-[15px] leading-relaxed text-ink-soft md:mx-0 md:text-[16.5px]">
              Invozy is GST billing for Indian businesses that gets out of your way — add a product, add a customer, and send a GST-correct invoice in under a minute.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <Button size="lg" className="px-7" asChild>
                <Link href="/signup">
                  Create your workspace <ArrowRight size={15} />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Log in</Link>
              </Button>
            </div>
          </div>

          {/* Decorative mini invoice preview — purely illustrative, no real data */}
          <div className="relative mx-auto hidden w-full max-w-[360px] md:block">
            <div aria-hidden className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-brand/15 to-gold/10" />
            <div className="relative rotate-1 rounded-xl2 border border-line bg-surface p-4 shadow-elevated transition-transform hover:rotate-0">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <span className="text-[11px] font-extrabold text-ink">Acme Traders</span>
                <span className="rounded-full bg-green-soft px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-green">Paid</span>
              </div>
              <div className="mt-2.5 space-y-1.5 text-[11px]">
                <div className="flex justify-between text-ink-soft">
                  <span>Ice Block 25kg × 4</span>
                  <span className="font-mono text-ink-body">₹720.00</span>
                </div>
                <div className="flex justify-between text-ink-soft">
                  <span>Delivery charge</span>
                  <span className="font-mono text-ink-body">₹100.00</span>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-dashed border-line pt-2">
                <span className="text-[11px] font-bold text-ink-soft">CGST 9% + SGST 9%</span>
                <span className="font-mono text-[11px] text-ink-body">₹147.60</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between rounded-md2 bg-brand-light px-2.5 py-2">
                <span className="text-[12px] font-extrabold text-brand-dark">Total due</span>
                <span className="font-mono text-[13px] font-extrabold text-brand-dark">₹967.60</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust ticker — a dedicated thin band instead of crowding the hero,
          so the fold stays focused on the headline and CTA. */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-4 sm:justify-between">
          {TRUST_PILLS.map((p) => (
            <span key={p} className="flex items-center gap-2 text-[12.5px] font-bold text-ink-soft">
              <Check size={13} className="flex-shrink-0 text-green" /> {p}
            </span>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-[1140px] px-5 py-16 md:py-20">
        <div className="mx-auto max-w-[560px] text-center">
          <span className="text-[13px] font-extrabold uppercase tracking-wide text-brand">How it works</span>
          <h2 className="mt-2 text-[26px] font-extrabold text-ink md:text-[32px]">Three steps. Under a minute.</h2>
        </div>
        <div className="relative mx-auto mt-10 grid max-w-[900px] grid-cols-1 gap-6 sm:grid-cols-3">
          <div aria-hidden className="absolute left-0 right-0 top-[27px] hidden border-t-2 border-dashed border-line sm:block" />
          {STEPS.map((s, i) => (
            <div key={s.label} className="relative flex flex-col items-center rounded-xl2 border border-line bg-surface p-5 text-center shadow-card">
              <span className="relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[14px] font-extrabold text-white ring-4 ring-bg">
                {i + 1}
              </span>
              <span className="mt-3 flex items-center gap-1.5 text-[14px] font-extrabold text-ink">
                <s.icon size={15} className="text-brand" /> {s.label}
              </span>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Guided-tour showcase — a decorative mock of the real in-app tooltip
          (see src/components/onboarding/onboarding-tour.tsx) so this promise
          is visually backed up, not just claimed. */}
      <section id="tour" className="border-y border-line bg-surface/60">
        <div className="mx-auto max-w-[1140px] px-5 py-16 md:py-20">
          <div className="grid grid-cols-1 items-center gap-8 rounded-xl2 border border-line bg-surface p-6 shadow-card md:grid-cols-2 md:p-10">
            <div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-soft text-gold">
                <Compass size={16} />
              </span>
              <h2 className="mt-3 text-[20px] font-extrabold text-ink md:text-[24px]">New here? You&apos;re never lost.</h2>
              <p className="mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-ink-soft">
                A built-in guided tour highlights your dashboard, your catalog, your customer list, and the new-invoice button the moment you sign up — a real walkthrough, not a wall of text. Replay it
                anytime from your account menu.
              </p>
              <ul className="mt-4 flex flex-col gap-1.5 text-[12.5px] font-semibold text-ink-body">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="flex-shrink-0 text-gold" /> Starts automatically on your first login
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="flex-shrink-0 text-gold" /> Points at the real app, not a slideshow
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="flex-shrink-0 text-gold" /> Replayable anytime — great for onboarding teammates
                </li>
              </ul>
            </div>

            {/* Decorative — mirrors the real onboarding-tour.tsx tooltip styling */}
            <div className="relative mx-auto w-full max-w-[340px]">
              <div className="rounded-xl2 border border-line bg-bg p-3 shadow-card">
                <div className="flex items-center gap-2 rounded-md2 bg-brand-light px-2.5 py-2 text-[12px] font-extrabold text-brand">
                  <BarChart3 size={13} /> Dashboard
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-md2 px-2.5 py-2 text-[12px] font-bold text-ink-faint">
                  <Package size={13} /> Products
                </div>
                <div className="mt-1 flex items-center gap-2 rounded-md2 px-2.5 py-2 text-[12px] font-bold text-ink-faint">
                  <Users size={13} /> Customers
                </div>
              </div>
              <div className="relative z-10 mt-3 ml-auto w-[220px] rounded-lg2 border border-line bg-surface p-3 shadow-elevated sm:absolute sm:-top-5 sm:mt-0 sm:right-[-40px]">
                <p className="text-[11.5px] leading-relaxed text-ink-body">This is your dashboard — a quick snapshot of what&apos;s billed and what&apos;s outstanding.</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-ink-faint">1 of 6</span>
                  <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-extrabold text-white">Next</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-[1140px] px-5 py-16 md:py-20">
        <div className="mx-auto max-w-[560px] text-center">
          <span className="text-[13px] font-extrabold uppercase tracking-wide text-brand">Everything you need</span>
          <h2 className="mt-2 text-[26px] font-extrabold text-ink md:text-[32px]">Built for how you actually bill</h2>
        </div>
        <div className="mx-auto mt-10 grid max-w-[1140px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:auto-rows-fr">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={clsx(
                  'rounded-xl2 border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand/50 hover:shadow-elevated',
                  i === 0 && 'lg:col-span-2'
                )}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${BADGE_CLASSES[f.color]}`}>
                  <Icon size={16} />
                </span>
                <h3 className="mt-3 text-[14px] font-extrabold text-ink">{f.title}</h3>
                <p className={clsx('mt-1.5 text-[12.5px] leading-relaxed text-ink-soft', i === 0 && 'lg:max-w-[520px]')}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Dark contrast band — a deliberate visual break from the stack of
          white cards above, using the fixed near-black --chrome token so it
          reads the same in light and dark mode. */}
      <section className="bg-[hsl(var(--chrome))] py-14 md:py-16">
        <div className="mx-auto max-w-[1140px] px-5">
          <h2 className="text-center text-[13px] font-extrabold uppercase tracking-wide text-white/50">Why teams trust Invozy</h2>
          <div className="mx-auto mt-8 grid max-w-[1100px] grid-cols-1 gap-4 sm:grid-cols-3">
            {WHY_INVOZY.map((w) => (
              <div key={w.title} className="flex items-center gap-3 rounded-xl2 border border-white/10 bg-white/5 p-4">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                  <w.icon size={16} />
                </span>
                <div>
                  <div className="text-[13px] font-extrabold text-white">{w.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-white/60">{w.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — full-bleed brand gradient band so the close reads as a
          real destination, not another white card in the stack. */}
      <section className="bg-gradient-to-br from-brand to-brand-dark py-16 md:py-20">
        <div className="mx-auto max-w-[560px] px-5 text-center">
          <h2 className="text-[22px] font-extrabold text-white md:text-[28px]">Free while we&apos;re building this out</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-white/85">
            Invozy is in its early days — every feature above is free to use today. Paid plans are coming later, but existing accounts won&apos;t be surprised by the switch.
          </p>
          <ul className="mx-auto mt-5 flex max-w-[320px] flex-col gap-1.5 text-left text-[12.5px] font-semibold text-white">
            <li className="flex items-center gap-2">
              <Check size={14} className="flex-shrink-0 text-white" /> No credit card to sign up
            </li>
            <li className="flex items-center gap-2">
              <Check size={14} className="flex-shrink-0 text-white" /> Unlimited invoices, customers &amp; products
            </li>
            <li className="flex items-center gap-2">
              <Check size={14} className="flex-shrink-0 text-white" /> Your own branded workspace
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="flex-shrink-0 text-white" /> A guided tour walks you through your first invoice
            </li>
          </ul>
          <Button className="mt-6 w-full justify-center bg-white text-brand-dark hover:bg-white/90" asChild>
            <Link href="/signup">Get started free</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1140px] px-5 py-10">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <Image src="/brand/logo.png" alt="Invozy" width={994} height={324} className="h-7 w-auto" />
              <p className="mt-3 max-w-[200px] text-[11.5px] leading-relaxed text-ink-faint">GST billing for Indian businesses that gets out of your way.</p>
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Product</div>
              <div className="mt-3 flex flex-col gap-2 text-[12.5px] font-semibold text-ink-soft">
                <a href="#how-it-works" className="hover:text-ink">
                  How it works
                </a>
                <a href="#features" className="hover:text-ink">
                  Features
                </a>
                <a href="#tour" className="hover:text-ink">
                  Guided tour
                </a>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Account</div>
              <div className="mt-3 flex flex-col gap-2 text-[12.5px] font-semibold text-ink-soft">
                <Link href="/login" className="hover:text-ink">
                  Log in
                </Link>
                <Link href="/signup" className="hover:text-ink">
                  Sign up free
                </Link>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Legal</div>
              <div className="mt-3 flex flex-col gap-2 text-[12.5px] font-semibold text-ink-soft">
                <Link href="/terms" className="hover:text-ink">
                  Terms &amp; Conditions
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[12px] text-ink-faint">
            <span>&copy; {new Date().getFullYear()} Invozy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
