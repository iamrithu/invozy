'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Search, Plus, Building2, ChevronDown, Package, Users, Receipt, LogOut, UserCog, Compass, UsersRound, History, CreditCard, Zap } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { CommandPalette } from '@/components/shell/command-palette';
import { NotificationsBell } from '@/components/shell/notifications-bell';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { useGlobalSearch } from '@/hooks/use-global-search';
import { useAppDispatch } from '@/lib/redux/hooks';
import { requestTour } from '@/lib/redux/ui-slice';
import { fmtInr } from '@/lib/gst';
import { Skeleton } from '@/components/ui/skeleton';
import { roleLabel, useCurrentUser, userLabel } from '@/components/current-user';
import { initials } from '@/lib/avatar';
import { useModules } from '@/components/modules/modules-provider';

export function TopBar({ company }: { company: { name: string; logoUrl: string | null } }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  // From the app layout (CurrentUserProvider) rather than useSession(): the
  // session cookie only carries the user id, not their name or role.
  const me = useCurrentUser();
  const modules = useModules();
  const meLabel = userLabel(me);
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useGlobalSearch(search);

  const hasResults = !!search.trim();
  const products = data?.products ?? [];
  const customers = data?.customers ?? [];
  const invoices = data?.invoices ?? [];
  const noMatches = hasResults && !isFetching && products.length === 0 && customers.length === 0 && invoices.length === 0;

  function goTo(path: string) {
    setSearch('');
    setShowResults(false);
    router.push(path);
  }

  return (
    <header className="sticky top-0 z-40 grid h-[52px] flex-shrink-0 grid-cols-[auto_1fr_auto] items-center gap-1.5 border-b border-line bg-surface px-2.5 sm:h-[54px] sm:gap-4 sm:px-5 print:hidden">
      <Link href="/dashboard" className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm2 bg-brand text-white sm:h-8 sm:w-8">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Building2 size={13} className="sm:hidden" />
          )}
          {!company.logoUrl && <Building2 size={17} className="hidden sm:block" />}
        </span>
        <span className="max-w-[130px] truncate whitespace-nowrap text-[12.5px] font-extrabold text-ink sm:max-w-[260px] sm:text-[16px]">{company.name}</span>
      </Link>

      <div className="hidden justify-center sm:flex">
        <div ref={containerRef} data-tour="search" className="relative w-full max-w-[420px]">
          <div className="flex items-center gap-2 rounded-sm2 border border-line bg-surface-alt px-3 py-2 text-ink-faint">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder="Search products, customers, invoices…"
              className="w-full bg-transparent text-[13px] text-ink-body outline-none placeholder:text-ink-faint"
            />
            <span className="flex-shrink-0 rounded-sm2 border border-line bg-surface px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">⌘K</span>
          </div>
          {showResults && hasResults && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[60] max-h-[320px] overflow-y-auto rounded-lg2 border border-line bg-surface shadow-elevated">
              {products.length > 0 && (
                <>
                  <div className="px-2.5 pb-0.5 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">Products</div>
                  {products.map((p: any) => (
                    <button key={p.id} onMouseDown={() => goTo('/products')} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-brand-light">
                      <Package size={14} className="flex-shrink-0 text-brand" />
                      <span className="flex-1 truncate text-[12.5px] font-bold text-ink">{p.name}</span>
                      <span className="flex-shrink-0 text-[11px] text-ink-faint">{fmtInr(Number(p.price))}</span>
                    </button>
                  ))}
                </>
              )}
              {customers.length > 0 && (
                <>
                  <div className="px-2.5 pb-0.5 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">Customers</div>
                  {customers.map((c: any) => (
                    <button key={c.id} onMouseDown={() => goTo('/customers')} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-brand-light">
                      <Users size={14} className="flex-shrink-0 text-brand" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">
                        {c.shopName || c.name}
                        {c.shopName && <span className="ml-1.5 font-normal text-ink-faint">{c.name}</span>}
                      </span>
                      <span className="flex-shrink-0 text-[11px] text-ink-faint">{c.state}</span>
                    </button>
                  ))}
                </>
              )}
              {invoices.length > 0 && (
                <>
                  <div className="px-2.5 pb-0.5 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">Invoices</div>
                  {invoices.map((inv: any) => (
                    <button key={inv.id} onMouseDown={() => goTo(`/invoices/${inv.id}`)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-brand-light">
                      <Receipt size={14} className="flex-shrink-0 text-brand" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">
                        {inv.number}
                        {inv.customer && <span className="ml-1.5 font-normal text-ink-faint">{inv.customer.shopName || inv.customer.name}</span>}
                      </span>
                      <span className="flex-shrink-0 text-[11px] text-ink-faint">{inv.status}</span>
                    </button>
                  ))}
                </>
              )}
              {hasResults && isFetching && !data && (
                <div className="space-y-1.5 p-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                      <Skeleton className="h-3.5 w-3.5 flex-shrink-0 rounded-sm2" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                  ))}
                </div>
              )}
              {noMatches && <div className="p-4 text-center text-[12px] text-ink-faint">No matches for &quot;{search}&quot;</div>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-self-end gap-1.5 sm:gap-3">
        <ThemeToggle className="h-7 w-7 sm:h-9 sm:w-9" iconSize={14} />

        <NotificationsBell />

        <div className="flex flex-shrink-0" data-tour="new-invoice">
          {/* Every sale starts as an order; its invoice is generated from it. */}
          <Link
            href="/orders/new"
            className="flex items-center gap-1.5 rounded-l-sm2 border-r border-white/25 bg-brand px-2 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark sm:px-4 sm:py-2"
          >
            <Plus size={14} className="sm:hidden" />
            <Plus size={15} className="hidden sm:block" />
            <span className="hidden sm:inline">New order</span>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="More quick-add options"
                className="flex items-center justify-center rounded-r-sm2 bg-brand-dark px-1.5 text-white sm:px-2.5"
              >
                <ChevronDown size={13} className="sm:hidden" />
                <ChevronDown size={14} className="hidden sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push('/orders/new?quick=1')}>
                <Zap size={14} /> Quick sale
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/invoices/new')}>
                <Receipt size={14} /> Invoice without an order
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAddProductOpen(true)}>
                <Package size={14} /> Add product
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddCustomerOpen(true)}>
                <Users size={14} /> Add customer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Account menu"
              data-tour="account-menu"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-[11px] font-extrabold text-brand-dark sm:h-9 sm:w-9 sm:text-[12px]"
            >
              {initials(me.name || meLabel.split('@')[0]).slice(0, 2) || 'U'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[210px] max-w-[260px]">
            <DropdownMenuLabel className="font-normal">
              <div className="truncate text-[13px] font-bold text-ink">{meLabel}</div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                <span
                  className={`flex-shrink-0 rounded-sm2 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${
                    me.isOwner ? 'bg-brand-light text-brand-dark' : 'bg-surface-alt text-ink-soft'
                  }`}
                >
                  {roleLabel(me.role)}
                </span>
                {me.name && (me.email || me.phone) && <span className="truncate text-[11px] font-semibold text-ink-faint">{me.email || me.phone}</span>}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/account')}>
              <UserCog size={14} /> My account
            </DropdownMenuItem>
            {me.isOwner && (
              <>
                {modules.enabled('team') && (
                  <DropdownMenuItem onClick={() => router.push('/team')}>
                    <UsersRound size={14} /> Team &amp; logins
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => router.push('/billing')} data-tour="menu-billing">
                  <CreditCard size={14} /> Billing &amp; plan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/activity')}>
                  <History size={14} /> Activity log
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => dispatch(requestTour())}>
              <Compass size={14} /> Take the tour
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut size={14} /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette onOpenQuickAddProduct={() => setAddProductOpen(true)} onOpenQuickAddCustomer={() => setAddCustomerOpen(true)} />
      <ProductFormDialog open={addProductOpen} onOpenChange={setAddProductOpen} mode="create" />
      <CustomerFormDialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen} mode="create" />
    </header>
  );
}
