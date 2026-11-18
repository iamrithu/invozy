import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Building2, CreditCard, Plug, Receipt, Settings, ShoppingBag, UserCog, UsersRound, type LucideIcon } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getCompany } from '@/lib/get-company';
import { isModuleEnabled } from '@/lib/modules';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Settings — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

type Card = { href?: string; title: string; detail: string; icon: LucideIcon; soon?: boolean };

/** One place for everything that is set once. The existing pages keep their
 * own URLs (/company, /team, /billing, /account); this hub links to them and
 * lists the settings that arrive with orders and the web store. */
export default async function SettingsPage() {
  const me = await requireUser().catch(() => null);
  if (!me) redirect('/login');
  const company = await getCompany();
  const isOwner = me.role === 'OWNER';

  const business: Card[] = [
    { href: '/company', title: 'Company profile', detail: 'Business name, address, GSTIN, bank and UPI details, logo and brand colour, invoice template, numbering and PDF layout.', icon: Building2 },
    ...(isOwner && isModuleEnabled(company.disabledModules, 'team')
      ? [{ href: '/team', title: 'Team & logins', detail: 'Add staff logins and choose who is an owner.', icon: UsersRound } satisfies Card]
      : []),
    ...(isOwner
      ? [
          { href: '/settings/orders', title: 'Orders & invoicing', detail: 'Order numbers, and when each order’s invoice is generated: on confirm, on dispatch or by hand.', icon: ShoppingBag } satisfies Card,
          { href: '/billing', title: 'Plan & billing', detail: 'Your Invozy plan, trial days left and payments.', icon: CreditCard } satisfies Card,
        ]
      : []),
    { href: '/account', title: 'My account', detail: 'Your name, email, phone number and password.', icon: UserCog },
  ];
  const upcoming: Card[] = [
    { title: 'Taxes & GST', detail: 'GST rates per product, for orders that mix items with different rates.', icon: Receipt, soon: true },
    { title: 'Integrations', detail: 'Online payments for your web store and WhatsApp order messages. e-Invoice and Tally stay in Company profile.', icon: Plug, soon: true },
  ];

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
          <Settings size={18} className="text-brand" /> Settings
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">Everything you set once, in one place.</p>
      </div>

      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Your business</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {business.map((card) => (
          <SettingsCard key={card.title} card={card} />
        ))}
      </div>

      <h2 className="mb-2 mt-7 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Coming next</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {upcoming.map((card) => (
          <SettingsCard key={card.title} card={card} />
        ))}
      </div>
    </div>
  );
}

function SettingsCard({ card }: { card: Card }) {
  const Icon = card.icon;
  const body = (
    <>
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md2 ${card.soon ? 'bg-surface-alt text-ink-faint' : 'bg-brand-light text-brand'}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink">
          {card.title}
          {card.soon && <span className="rounded-sm2 bg-gold-soft px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-ink-soft">Coming soon</span>}
        </span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">{card.detail}</span>
      </span>
      {card.href && <ArrowRight size={16} className="mt-1 flex-shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />}
    </>
  );
  if (!card.href) {
    return <div className="flex items-start gap-3.5 rounded-xl2 border border-dashed border-line bg-surface/60 p-4">{body}</div>;
  }
  return (
    <Link href={card.href} className="group flex items-start gap-3.5 rounded-xl2 border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand/40">
      {body}
    </Link>
  );
}
