'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Joyride, STATUS, EVENTS, type Step, type EventData } from 'react-joyride';
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
function useTourSteps(isDesktopNav: boolean, hasSearchBox: boolean): TourStep[] {
  const router = useRouter();

  return useMemo(() => {
    function before(route: string, target: string) {
      return async () => {
        if (typeof window !== 'undefined' && window.location.pathname !== route) {
          router.push(route);
        }
        await waitForTarget(target);
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

    return steps.map((s) => ({ ...s, before: before(s.route, s.target as string) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopNav, hasSearchBox]);
}

/** Replayable anytime via the `requestTour` Redux action — dispatched by the
 * account menu's "Replay tour" item, and by the first-login WelcomeCard's
 * "Take the guided tour" button. First-run triggering itself lives in
 * WelcomeCard now, not here, so this component only reacts to that one
 * signal. Spans two routes (dashboard + the invoice builder) and adapts its
 * targets to the current viewport — see useTourSteps / useResponsiveNav. */
export function OnboardingTour() {
  const { isDesktopNav, hasSearchBox } = useResponsiveNav();
  const steps = useTourSteps(isDesktopNav, hasSearchBox);
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
