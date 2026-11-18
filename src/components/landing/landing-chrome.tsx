'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Page furniture for the public landing page: the floating header, the
// back-to-top button, the phone call-to-action bar, and small motion helpers
// (count-up numbers, rolling prices, magnetic buttons, hero parallax).
// Everything renders its final state on the server and only animates once
// the browser is ready; all of it stands still under reduced motion.

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Calls `fn` at most once per animation frame while the page scrolls or resizes. */
function useScrollFrame(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      ref.current();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    run();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
}

// ── Floating header ──────────────────────────────────────────────────────

/** A compact header that slides in once the hero's own menu has scrolled
 * away. It marks the section being read (a pill slides behind its link),
 * shows how far down the page you are, and steps aside while the dark
 * features gallery fills the screen. */
export function StickyNav({
  links,
  cta,
  appName,
  showSignIn,
  phoneBar = false,
}: {
  links: readonly (readonly [string, string])[];
  cta: { href: string; label: string };
  appName: string;
  showSignIn: boolean;
  /** The phone call-to-action bar is on the page: on phones, offer Sign in
   * here instead of a second copy of the same button. */
  phoneBar?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useScrollFrame(() => {
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max).toFixed(4) : 0})`;

    // Step aside while the gallery's dark stage covers the whole screen.
    const gallery = document.getElementById('all');
    const g = gallery?.getBoundingClientRect();
    const immersed = !!g && g.top < 0 && g.bottom > vh;
    setShown(y > 560 && !immersed);

    // The section being read: the last one whose top has passed 40% of the screen.
    let current: string | null = null;
    for (const [href] of links) {
      const el = document.getElementById(href.slice(1));
      if (el && el.getBoundingClientRect().top < vh * 0.4) current = href.slice(1);
    }
    setActive(current);
  });

  useEffect(() => {
    const pill = pillRef.current;
    const link = active ? navRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`) : null;
    if (!pill) return;
    if (!link) {
      pill.style.opacity = '0';
      return;
    }
    pill.style.opacity = '1';
    pill.style.width = `${link.offsetWidth}px`;
    pill.style.transform = `translateX(${link.offsetLeft}px)`;
  }, [active]);

  return (
    <div
      inert={!shown}
      className={cn(
        'fixed inset-x-0 top-3 z-50 flex justify-center px-3 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-24 opacity-0'
      )}
    >
      <div className="relative flex w-full max-w-[980px] items-center gap-3 overflow-hidden rounded-full border border-[#0F1115]/[0.08] bg-white/80 py-1.5 pl-2 pr-1.5 shadow-[0_18px_44px_-22px_rgba(15,17,21,0.5)] backdrop-blur-xl">
        <a href="#top" className="flex flex-none items-center gap-2" aria-label={`${appName}, back to top`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.png" alt="" className="h-8 w-8 object-contain" />
          <span className="text-[18px] font-bold tracking-[-0.04em] text-[#0F1115]">{appName}</span>
        </a>
        <nav ref={navRef} aria-label="Sections" className="relative ml-2 hidden items-center lg:flex">
          <span ref={pillRef} aria-hidden className="landing-nav-pill absolute inset-y-0 left-0 rounded-full bg-[#0F1115]/[0.06] opacity-0" />
          {links.map(([href, label]) => {
            const id = href.slice(1);
            return (
              <a
                key={href}
                href={href}
                data-id={id}
                aria-current={active === id ? 'location' : undefined}
                className={cn('relative rounded-full px-3 py-1.5 text-[14px] font-medium transition-colors', active === id ? 'text-[#0F1115]' : 'text-[#626876] hover:text-[#0F1115]')}
              >
                {label}
              </a>
            );
          })}
        </nav>
        <span className="flex-1" />
        {showSignIn && (
          <Link
            href="/login"
            className={cn(
              'text-[14px] font-medium text-[#3D4350] transition-colors hover:text-[#0F1115]',
              phoneBar ? 'inline-flex h-9 items-center rounded-full border border-[#0F1115]/10 px-4 sm:h-auto sm:border-0 sm:px-0' : 'hidden sm:inline'
            )}
          >
            Sign in
          </Link>
        )}
        <Link
          href={cta.href}
          className={cn(
            'landing-shine group h-9 flex-none items-center gap-1.5 rounded-full bg-[#0F1115] pl-4 pr-3 text-[14px] font-semibold text-white',
            phoneBar ? 'hidden sm:inline-flex' : 'inline-flex'
          )}
        >
          {cta.label}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px]">
          <span ref={barRef} className="block h-full origin-left bg-brand" style={{ transform: 'scaleX(0)' }} />
        </span>
      </div>
    </div>
  );
}

// ── Back to top ──────────────────────────────────────────────────────────

/** A round button that appears further down the page; its ring fills as you
 * read. Sits above the phone call-to-action bar on small screens. */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  const ringRef = useRef<SVGCircleElement>(null);

  useScrollFrame(() => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    ringRef.current?.setAttribute('stroke-dashoffset', String(max > 0 ? (1 - Math.min(1, y / max)).toFixed(4) : 1));
    setShown(y > 900);
  });

  return (
    <button
      type="button"
      aria-label="Back to top"
      inert={!shown}
      onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })}
      className={cn(
        'group fixed bottom-[88px] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#0F1115] text-white shadow-[0_16px_34px_-14px_rgba(15,17,21,0.6)] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-1 motion-reduce:transition-none sm:bottom-6 sm:right-6',
        shown ? 'scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'
      )}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
        <circle ref={ringRef} cx="24" cy="24" r="22" pathLength={1} fill="none" stroke="hsl(var(--brand))" strokeWidth="2" strokeDasharray="1" strokeDashoffset="1" strokeLinecap="round" />
      </svg>
      <ArrowUp size={18} className="transition-transform duration-300 group-hover:-translate-y-0.5" aria-hidden />
    </button>
  );
}

// ── Phone call-to-action bar ─────────────────────────────────────────────

/** On phones, a bar with the main call to action rides along the bottom once
 * the hero is gone, and gets out of the way near the closing section. */
export function MobileCta({ href, label }: { href: string; label: string }) {
  const [shown, setShown] = useState(false);

  useScrollFrame(() => {
    const y = window.scrollY;
    const left = document.documentElement.scrollHeight - y - window.innerHeight;
    setShown(y > 700 && left > 900);
  });

  return (
    <div
      inert={!shown}
      className={cn(
        'fixed inset-x-3 bottom-3 z-40 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none sm:hidden',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-24 opacity-0'
      )}
    >
      <Link href={href} className="flex h-14 items-center justify-between rounded-2xl bg-[#0F1115] pl-5 pr-2 text-[16px] font-semibold text-white shadow-[0_18px_40px_-16px_rgba(15,17,21,0.7)]">
        {label}
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
          <ArrowRight size={17} aria-hidden />
        </span>
      </Link>
    </div>
  );
}

// ── Motion helpers ───────────────────────────────────────────────────────

/** A number that counts up from zero the first time it comes into view. The
 * server renders the final value, so without JavaScript it simply shows. */
export function CountUp({ to, prefix = '', suffix = '', duration = 1400 }: { to: number; prefix?: string; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !('IntersectionObserver' in window)) return;
    // Only count if it hasn't been seen yet (still below the fold).
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setValue(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const k = Math.min(1, (now - start) / duration);
          setValue(to * (1 - Math.pow(1 - k, 3)));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      setValue(to);
    };
  }, [to, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {Math.round(value).toLocaleString('en-IN')}
      {suffix}
    </span>
  );
}

/** Shows `value`, rolling smoothly from the previous value when it changes. */
export function RollingNumber({ value, format, duration = 550 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value || reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const v = start + (value - start) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{format(Math.round(shown))}</span>;
}

/** Wraps a button so it leans a little towards the pointer while hovered. */
export function Magnetic({ children, strength = 0.18, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || window.matchMedia('(hover: none)').matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(-14, Math.min(14, (e.clientX - (r.left + r.width / 2)) * strength));
      const y = Math.max(-10, Math.min(10, (e.clientY - (r.top + r.height / 2)) * strength));
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    const leave = () => {
      el.style.transform = '';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [strength]);

  return (
    <span ref={ref} className={cn('inline-block transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]', className)}>
      {children}
    </span>
  );
}

/** Hero depth: elements marked `data-parallax="<px>"` drift with the pointer
 * while it is over the hero (`data-hero`), each by its own amount. Renders nothing. */
export function HeroParallax() {
  useEffect(() => {
    if (reducedMotion() || window.matchMedia('(hover: none)').matches) return;
    const hero = document.querySelector<HTMLElement>('[data-hero]');
    if (!hero) return;
    const layers = Array.from(hero.querySelectorAll<HTMLElement>('[data-parallax]'));
    let frame = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      frame = 0;
      for (const el of layers) {
        const depth = Number(el.dataset.parallax) || 0;
        el.style.transform = `translate3d(${(px * depth).toFixed(1)}px, ${(py * depth * 0.7).toFixed(1)}px, 0)`;
      }
    };
    const move = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth - 0.5) * 2;
      py = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      px = 0;
      py = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
      layers.forEach((el) => (el.style.transform = ''));
    };
  }, []);
  return null;
}
