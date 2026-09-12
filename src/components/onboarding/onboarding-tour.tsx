'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Joyride, STATUS, type Step, type EventData } from 'react-joyride';
import { completeOnboarding } from '@/actions/onboarding';
import { useAppSelector } from '@/lib/redux/hooks';

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

/** Every step declares the route its target lives on. The `before` hook
 * (attached to all of them, not just the transition points) checks the
 * current path and navigates there first if needed — this makes both
 * forward AND "Back" button navigation between the dashboard steps and the
 * invoice-builder steps work, since Joyride re-runs `before` whenever a step
 * is about to show, regardless of direction. `targetWaitTimeout` below gives
 * the new route's page a few seconds to mount before Joyride gives up on
 * finding the target.
 *
 * Responsive: below the sidebar's md: breakpoint, the three nav steps
 * target the bottom-nav's equivalent items instead (see data-tour on
 * src/components/shell/bottom-nav.tsx); below the search box's own sm:
 * breakpoint (no search affordance exists at all on a narrow phone), that
 * step is dropped entirely rather than pointing at nothing. */
function useTourSteps(isDesktopNav: boolean, hasSearchBox: boolean): TourStep[] {
  const router = useRouter();

  return useMemo(() => {
    function before(route: string) {
      return async () => {
        if (typeof window !== 'undefined' && window.location.pathname !== route) {
          router.push(route);
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      };
    }

    const dashboard = '/dashboard';
    const builder = '/invoices/new';
    const navTarget = (name: string) => `[data-tour="${isDesktopNav ? 'nav' : 'mobile-nav'}-${name}"]`;
    const navPlacement = isDesktopNav ? 'right' : 'top';

    const steps: TourStep[] = [
      {
        route: dashboard,
        target: navTarget('dashboard'),
        content: "This is your dashboard — a quick snapshot of what's billed, what's outstanding, and what needs attention.",
        placement: navPlacement,
        skipBeacon: true,
      },
      {
        route: dashboard,
        target: navTarget('products'),
        content: "Add what you sell here first — your catalog of products, prices, and units. It's what shows up when you build an invoice.",
        placement: navPlacement,
      },
      {
        route: dashboard,
        target: navTarget('customers'),
        content: 'Add who you bill here — their name, phone, and GST state. That state is what decides CGST/SGST vs IGST automatically.',
        placement: navPlacement,
      },
      ...(hasSearchBox
        ? [
            {
              route: dashboard,
              target: '[data-tour="search"]',
              content: 'Search products, customers, or invoices instantly — or press ⌘K (Ctrl+K) to jump anywhere in the app.',
              placement: 'bottom' as const,
            },
          ]
        : []),
      {
        route: dashboard,
        target: '[data-tour="new-invoice"]',
        content: "This is where you'll actually bill someone. Click Next and we'll walk through building one, step by step.",
        placement: 'bottom',
      },
      {
        route: builder,
        target: '[data-tour="bill-to"]',
        content: 'Start here — search an existing customer by name or phone, or add a new one on the spot without leaving this screen.',
        placement: isDesktopNav ? 'right' : 'bottom',
      },
      {
        route: builder,
        target: '[data-tour="add-products"]',
        content: 'Add products from your catalog with one click. Anything you\'ve billed this customer before shows up first, under "Frequently ordered."',
        placement: isDesktopNav ? 'right' : 'bottom',
      },
      {
        route: builder,
        target: '[data-tour="custom-item"]',
        content: "Selling something that isn't in your catalog? Add it right here — no need to go create a product first. You can save it for next time if you want to.",
        placement: 'top',
      },
      {
        route: builder,
        target: '[data-tour="invoice-sheet"]',
        content: 'This is your live invoice — GST, totals, and discounts update instantly as you add items, so you always see the real total before you send it.',
        placement: isDesktopNav ? 'left' : 'top',
      },
      {
        route: builder,
        target: '[data-tour="preview-btn"]',
        content: 'Preview shows exactly what your customer will see — the same layout that prints or downloads as a PDF.',
        placement: 'bottom',
      },
      {
        route: builder,
        target: '[data-tour="save-buttons"]',
        content: "When you're ready, save as a draft to keep editing later, or mark it sent — the invoice number is assigned the moment you save.",
        placement: 'top',
      },
      {
        route: builder,
        target: '[data-tour="account-menu"]',
        content: "That's the whole flow — from setup to a sent invoice. Come back here anytime to replay this tour.",
        placement: 'bottom-end',
      },
    ];

    return steps.map((s) => ({ ...s, before: before(s.route) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopNav, hasSearchBox]);
}

/** Auto-starts once for a brand-new user (see the `start` prop, sourced from
 * `User.onboardedAt` server-side) and can be replayed anytime via the
 * `requestTour` Redux action (wired to the account menu's "Replay tour").
 * Spans two routes (dashboard + the invoice builder) and adapts its targets
 * to the current viewport — see useTourSteps / useResponsiveNav. */
export function OnboardingTour({ start }: { start: boolean }) {
  const { isDesktopNav, hasSearchBox } = useResponsiveNav();
  const steps = useTourSteps(isDesktopNav, hasSearchBox);
  const [run, setRun] = useState(false);
  const tourRequestId = useAppSelector((s) => s.ui.tourRequestId);
  const lastRequestId = useRef(tourRequestId);

  useEffect(() => {
    if (start) setRun(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tourRequestId !== lastRequestId.current) {
      lastRequestId.current = tourRequestId;
      setRun(true);
    }
  }, [tourRequestId]);

  function handleEvent(data: EventData) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setRun(false);
      if (start) completeOnboarding();
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
