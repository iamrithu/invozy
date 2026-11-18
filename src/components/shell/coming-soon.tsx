import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { getCompany } from '@/lib/get-company';
import { isPathEnabled } from '@/lib/modules';
import { navGroupFor, navItemFor } from '@/lib/nav';
import { COMING_SOON } from '@/lib/coming-soon';

/** The page for a planned sidebar item (`soon: true` in src/lib/nav.ts):
 * what the screen will do, and which existing screens cover the need until
 * it ships. Copy lives in src/lib/coming-soon.ts. */
export async function ComingSoon({ href }: { href: string }) {
  const item = navItemFor(href);
  const copy = COMING_SOON[href];
  if (!item || !copy) notFound();
  const group = navGroupFor(href);
  const company = await getCompany();
  // Don't point at a screen whose module is switched off for this company.
  const meanwhile = copy.meanwhile.filter((link) => isPathEnabled(company.disabledModules, link.href));
  const Icon = item.icon;

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-5">
        <h1 className="flex flex-wrap items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
          <Icon size={18} className="text-brand" /> {item.label}
          <span className="rounded-sm2 bg-gold-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">Coming soon</span>
        </h1>
        {group?.label && <p className="mt-1 text-[12px] font-semibold text-ink-faint">{group.label}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section className="rounded-xl2 border border-line bg-surface p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md2 bg-brand-light text-brand">
              <Icon size={20} />
            </span>
            <p className="max-w-[60ch] text-[14.5px] font-semibold leading-relaxed text-ink">{copy.summary}</p>
          </div>

          <h2 className="mt-6 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">What you’ll be able to do</h2>
          <ul className="mt-3 grid gap-2.5">
            {copy.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-body">
                <span className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-green-soft text-green">
                  <Check size={11} strokeWidth={3} />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="grid gap-4">
          {meanwhile.length > 0 && (
            <section className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Until then</h2>
              <ul className="mt-3 grid gap-2">
                {meanwhile.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group flex items-center gap-3 rounded-md2 border border-line px-3 py-2.5 transition-colors hover:border-brand/40 hover:bg-brand-light/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-ink">{link.label}</span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">{link.detail}</span>
                      </span>
                      <ArrowRight size={15} className="flex-shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="flex items-start gap-2.5 rounded-xl2 border border-dashed border-line px-4 py-3.5 text-[12px] leading-relaxed text-ink-soft">
            <Sparkles size={15} className="mt-0.5 flex-shrink-0 text-brand" />
            <span>This screen is on the way. It will appear right here when it ships, and there is nothing to set up before then.</span>
          </section>
        </aside>
      </div>
    </div>
  );
}
