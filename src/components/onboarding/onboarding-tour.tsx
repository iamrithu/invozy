'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Joyride, STATUS, EVENTS, type Step, type EventData } from 'react-joyride';
import { completeOnboarding } from '@/actions/onboarding';
import { useAppSelector } from '@/lib/redux/hooks';
import { useCurrentUser } from '@/components/current-user';
import { useModules } from '@/components/modules/modules-provider';
import type { ModuleKey } from '@/lib/modules';

type TourStep = Step & { route: string };

const DESKTOP_NAV_QUERY = '(min-width: 768px)'; // matches the sidebar's md: breakpoint
const SEARCH_BOX_QUERY = '(min-width: 640px)'; // matches the top-bar search's sm: breakpoint

/** Tracks the two breakpoints the tour's targets actually depend on, live —
 * not just at mount — so a tour started (or replayed) after a resize/device
 * rotation always points at whichever nav (sidebar vs bottom-nav) and
 * search affordance are actually on screen. Defaults to "desktop" during
 * SSR/before hydration; corrected on the client before the tour can
 * possibly become visible (Joyride itself never renders during SSR). */
function useResponsiveNav() {
  const [isDesktopNav, setIsDesktopNav] = useState(true);
  const [hasSearchBox, setHasSearchBox] = useState(true);

  useEffect(() => {
    const navQuery = window.matchMedia(DESKTOP_NAV_QUERY);
    const searchQuery = window.matchMedia(SEARCH_BOX_QUERY);
    const updateNav = () => setIsDesktopNav(navQuery.matches);
    const updateSearch = () => setHasSearchBox(searchQuery.matches);
    updateNav();
    updateSearch();
    navQuery.addEventListener('change', updateNav);
    searchQuery.addEventListener('change', updateSearch);
    return () => {
      navQuery.removeEventListener('change', updateNav);
      searchQuery.removeEventListener('change', updateSearch);
    };
  }, []);

  return { isDesktopNav, hasSearchBox };
}

/** Polls for a target selector to actually exist (and have layout, i.e. not
 * `display:none`) before resolving, instead of guessing a fixed delay after
 * navigation. `force-dynamic` routes doing real Prisma-backed fetches
 * routinely take longer than any fixed sleep would assume — especially on a
 * cold Vercel serverless invocation — so this waits for the real thing.
 * Capped so it always resolves before Joyride's own `beforeTimeout`, which
 * would otherwise show the step's tooltip pointing at nothing. */
function waitForTarget(selector: string, timeoutMs = 7000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      const el = document.querySelector(selector);
      if (el && (el as HTMLElement).offsetParent !== null) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(); // let Joyride's own targetWaitTimeout handle a genuinely missing target
        return;
      }
      setTimeout(check, 100);
    }
    check();
  });
}

/** Resolves once the browser is on `route` (the app router updates the URL
 * when the new page has committed), or after the timeout. */
function waitForRoute(route: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check() {
      if (window.location.pathname === route || Date.now() - start > timeoutMs) return resolve();
      setTimeout(check, 100);
    })();
  });
}

const PAGE_HEADING = '[data-tour="page-heading"]';

/** Marks the current page's visible heading as the tour's target. Every page
 * has a `main h1`, so a plain selector would also match the page being left
 * behind mid-navigation — tagging only after the route has changed points
 * the step at the right page. */
function tagPageHeading() {
  document.querySelectorAll(PAGE_HEADING).forEach((el) => el.removeAttribute('data-tour'));
  const heading = Array.from(document.querySelectorAll<HTMLElement>('main h1')).find((el) => el.offsetParent !== null);
  heading?.setAttribute('data-tour', 'page-heading');
}

/** Every step declares the route its target lives on. The `before` hook
 * (attached to all of them, not just the transition points) checks the
 * current path and navigates there first if needed — this makes both
 * forward AND "Back" button navigation between the dashboard steps and the
 * invoice-builder steps work, since Joyride re-runs `before` whenever a step
 * is about to show, regardless of direction. It then waits for the step's
 * own target to actually exist (see waitForTarget) rather than guessing a
 * fixed delay, so a slow route transition doesn't leave the tour dimmed and
 * looking stuck.
 *
 * Responsive: below the sidebar's md: breakpoint, the three nav steps
 * target the bottom-nav's equivalent items instead (see data-tour on
 * src/components/shell/bottom-nav.tsx); below the search box's own sm:
 * breakpoint (no search affordance exists at all on a narrow phone), that
 * step is dropped entirely rather than pointing at nothing. */
function useTourSteps(isDesktopNav: boolean, hasSearchBox: boolean, access: { isOwner: boolean; module: (key: ModuleKey) => boolean }): TourStep[] {
  const router = useRouter();

  return useMemo(() => {
    function before(route: string, target: string) {
      return async () => {
        if (typeof window !== 'undefined' && window.location.pathname !== route) {
          router.push(route);
          await waitForRoute(route);
        }
        if (target === PAGE_HEADING) {
          await waitForTarget('main h1');
          tagPageHeading();
        }
        await waitForTarget(target);
      };
    }

    const dashboard = '/dashboard';
    const builder = '/invoices/new';
    const navTarget = (name: string) => `[data-tour="${isDesktopNav ? 'nav' : 'mobile-nav'}-${name}"]`;
    const navPlacement = isDesktopNav ? 'right' : 'top';
    /** A stop on a section's own page, pointing at its heading. */
    const page = (route: string, content: string): TourStep => ({ route, target: PAGE_HEADING, content, placement: 'bottom-start' });

    const steps: (TourStep | false)[] = [
      // ── Getting around ──────────────────────────────────────────────────
      {
        route: dashboard,
        target: navTarget('dashboard'),
        content: 'Your dashboard: what you’ve billed and collected, what’s overdue, and what needs a look today. New here? The setup checklist on this page shows what to fill in first.',
        placement: navPlacement,
        skipBeacon: true,
      },
      hasSearchBox && {
        route: dashboard,
        target: '[data-tour="search"]',
        content: 'Find any product, customer or invoice. Press ⌘K (Ctrl+K) to jump anywhere or run a quick action.',
        placement: 'bottom',
      },
      {
        route: dashboard,
        target: '[data-tour="notifications"]',
        content: 'Overdue bills, low stock and drafts waiting to be sent show up here. You can also switch the 8 AM summary email on or off.',
        placement: 'bottom-end',
      },
      {
        route: dashboard,
        target: '[data-tour="new-invoice"]',
        content: 'This is where you bill someone. Click Next and we’ll build one together.',
        placement: 'bottom',
      },

      // ── Making an invoice ───────────────────────────────────────────────
      {
        route: builder,
        target: '[data-tour="bill-to"]',
        content: 'Pick the customer — search by name or phone, or add a new one right here. Their state decides CGST + SGST or IGST for you.',
        placement: isDesktopNav ? 'right' : 'bottom',
      },
      {
        route: builder,
        target: '[data-tour="add-products"]',
        content: 'Add products with one tap. Things this customer usually buys come first, and their special prices apply on their own.',
        placement: isDesktopNav ? 'right' : 'bottom',
      },
      {
        route: builder,
        target: '[data-tour="custom-item"]',
        content: 'Selling something that isn’t in your catalog? Add it here without creating a product first.',
        placement: 'top',
      },
      {
        route: builder,
        target: '[data-tour="invoice-sheet"]',
        content: 'Your live invoice — GST, discounts and the total update as you go, exactly as your customer’s PDF will look.',
        placement: isDesktopNav ? 'left' : 'top',
      },
      {
        route: builder,
        target: '[data-tour="save-buttons"]',
        content: 'Save as a draft to finish later, or mark it sent. The invoice number is given when you save.',
        placement: 'top',
      },

      // ── Every section ───────────────────────────────────────────────────
      page('/invoices', 'All your invoices. Filter by status, record payments and give receipts, send WhatsApp reminders and share PDF links.'),
      page('/customers', 'Your customers, each with a running ledger. Set special prices per customer and send a statement of account in one tap.'),
      page('/products', 'Your catalog: sell in boxes and pieces with their own prices, set a default discount, HSN code and GST, and choose which products track stock.'),
      access.module('inventory') &&
        page('/inventory', 'Stock on hand for every tracked product. Count stock, see what’s low or expiring, get reorder suggestions, and open any product for its full stock ledger.'),
      access.module('purchases') &&
        page('/purchases', 'Supplier bills. Saving one adds the stock and records the GST you paid; attach a photo or PDF of the bill. Your suppliers live here too.'),
      access.module('returns') &&
        page('/credit-notes', 'Returns. Raise a credit note against an invoice — put good stock back, give part credit for damaged goods, then refund or adjust it against another bill.'),
      access.module('reports') &&
        page('/reports', 'Reports: sales, GST, money owed by age, collections and profit. Export to Excel, GSTR-1 or Tally, or download a full backup.'),
      access.isOwner && page('/company', 'Your business details, GST rates, bank and UPI, and how invoices look — template, logo and PDF layout. This is what prints on every bill.'),
      access.isOwner && access.module('team') && page('/team', 'Add logins for your team. Staff can bill and take payments, but can’t delete things or change settings.'),
      access.isOwner && page('/activity', 'Who did what and when — every change is recorded here.'),
      access.isOwner && page('/billing', 'Your plan, how much of it you’ve used this month, and your payments.'),
      {
        route: dashboard,
        target: '[data-tour="account-menu"]',
        content: 'Your account and password live here — and “Take the tour” brings this tour back any time. That’s everything!',
        placement: 'bottom-end',
      },
    ];

    return steps.filter((s): s is TourStep => !!s).map((s) => ({ ...s, before: before(s.route, s.target as string) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopNav, hasSearchBox, access.isOwner, access.module]);
}

/** The full product tour: getting around, making an invoice, then a stop on
 * every section the company has and this login may open. Replayable anytime
 * via the `requestTour` Redux action — dispatched by the account menu's
 * "Take the tour" item and the first-login WelcomeCard. Adapts its targets
 * to the viewport (sidebar vs bottom nav) — see useResponsiveNav. */
export function OnboardingTour() {
  const { isDesktopNav, hasSearchBox } = useResponsiveNav();
  // Only what this company has (modules) and this login may open (owner pages).
  const { isOwner } = useCurrentUser();
  const modules = useModules();
  const steps = useTourSteps(isDesktopNav, hasSearchBox, { isOwner, module: modules.enabled });
  const [run, setRun] = useState(false);
  const tourRequestId = useAppSelector((s) => s.ui.tourRequestId);
  const lastRequestId = useRef(tourRequestId);

  useEffect(() => {
    if (tourRequestId !== lastRequestId.current) {
      lastRequestId.current = tourRequestId;
      setRun(true);
    }
  }, [tourRequestId]);

  function handleEvent(data: EventData) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setRun(false);
      completeOnboarding();
    }
    // Joyride has no ERROR status in this version — a missing target surfaces
    // only as this event type, and it auto-advances on its own (uncontrolled
    // usage) after targetWaitTimeout. We just make it visible instead of
    // silently invisible, for whenever this needs debugging.
    if (data.type === EVENTS.TARGET_NOT_FOUND) {
      console.warn('[onboarding-tour] target not found, Joyride will auto-advance:', data.step?.target);
    }
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      options={{
        showProgress: true,
        buttons: ['back', 'skip', 'close', 'primary'],
        targetWaitTimeout: 8000,
        beforeTimeout: 8000,
        // Clear the sticky top bar (and any status banner above it) when a
        // step scrolls its target into view.
        scrollOffset: 140,
        primaryColor: 'hsl(var(--brand))',
        textColor: 'hsl(var(--ink))',
        backgroundColor: 'hsl(var(--surface))',
        arrowColor: 'hsl(var(--surface))',
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 10000,
      }}
    />
  );
}
