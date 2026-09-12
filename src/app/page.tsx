import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Receipt, Palette, ImagePlus, ShieldCheck, BarChart3, Building2, ArrowRight, Check } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shell/theme-toggle';

export const metadata: Metadata = { title: 'Invozy — GST billing & invoicing for growing businesses' };

const FEATURES = [
  { icon: Receipt, title: 'GST-ready invoicing', desc: 'CGST/SGST vs IGST worked out automatically from your customer’s state, with GST-compliant PDF invoices.' },
  { icon: Building2, title: 'Your own workspace', desc: 'Every business gets its own isolated company — your products, customers, and invoices, never mixed with anyone else’s.' },
  { icon: ImagePlus, title: 'Photo-rich catalog', desc: 'Add one or more photos to every product, and a logo to your company profile.' },
  { icon: Palette, title: 'Match your brand', desc: 'Pick a theme color for your workspace so it looks like yours, not a template.' },
  { icon: BarChart3, title: 'Reports that matter', desc: 'Track what’s billed, what’s collected, and who owes you — without a spreadsheet.' },
  { icon: ShieldCheck, title: 'Built for teams', desc: 'Sign in with your own email or phone; reset access any time.' },
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.role === 'OWNER') redirect('/dashboard');
  if (session?.user?.role === 'SUPER_ADMIN') redirect('/admin');

  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center">
          <Image src="/brand/logo.png" alt="Invozy" width={994} height={324} priority className="h-8 w-auto md:h-9" />
        </Link>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link href="/login" className="text-[13px] font-bold text-ink-soft hover:text-ink">
            Log in
          </Link>
          <Button asChild>
            <Link href="/signup">Sign up free</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-[720px] px-5 pb-14 pt-10 text-center md:pb-20 md:pt-16">
        <h1 className="text-[32px] font-extrabold leading-tight text-ink md:text-[44px]">GST billing, built for how your business actually runs</h1>
        <p className="mx-auto mt-4 max-w-[520px] text-[15px] text-ink-soft md:text-[16px]">
          Invozy is invoicing software for Indian businesses — GST-correct by default, with your own branded workspace, product photos, and reports, all free to start.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">
              Create your workspace <ArrowRight size={15} />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 pb-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-xl2 border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand/50">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand-dark">
                  <Icon size={16} />
                </span>
                <h3 className="mt-3 text-[14px] font-extrabold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-[560px] px-5 pb-20">
        <div className="rounded-xl2 border border-brand bg-brand-light p-6 text-center shadow-card">
          <h2 className="text-[18px] font-extrabold text-brand-dark">Free while we&apos;re building this out</h2>
          <p className="mt-2 text-[13px] text-ink-body">
            Invozy is in its early days — every feature above is free to use today. Paid plans are coming later, but existing accounts won&apos;t be surprised by the switch.
          </p>
          <ul className="mx-auto mt-4 flex max-w-[320px] flex-col gap-1.5 text-left text-[12.5px] font-semibold text-ink-body">
            <li className="flex items-center gap-2">
              <Check size={14} className="flex-shrink-0 text-brand-dark" /> No credit card to sign up
            </li>
            <li className="flex items-center gap-2">
              <Check size={14} className="flex-shrink-0 text-brand-dark" /> Unlimited invoices, customers &amp; products
            </li>
            <li className="flex items-center gap-2">
              <Check size={14} className="flex-shrink-0 text-brand-dark" /> Your own branded workspace
            </li>
          </ul>
          <Button className="mt-5 w-full justify-center" asChild>
            <Link href="/signup">Get started free</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-line py-6">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-5 text-[12px] text-ink-faint">
          <span>&copy; {new Date().getFullYear()} Invozy</span>
          <Link href="/terms" className="font-bold text-ink-soft hover:text-ink">
            Terms &amp; Conditions
          </Link>
        </div>
      </footer>
    </div>
  );
}
