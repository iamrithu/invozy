'use client';

import { useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { themeHydrated, toggleTheme } from '@/lib/redux/theme-slice';

/** Reused on every page that can be reached before (or without) the
 * authenticated app shell — landing, login, signup, admin login, admin
 * dashboard — so the theme can be switched before entering the app, not
 * just from inside TopBar. */
export function ThemeToggle({ className, iconSize = 16 }: { className?: string; iconSize?: number }) {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.theme.theme);

  useEffect(() => {
    dispatch(themeHydrated());
  }, [dispatch]);

  return (
    <button
      type="button"
      onClick={() => dispatch(toggleTheme())}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 border border-line bg-surface text-ink-soft', className)}
    >
      {theme === 'dark' ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
    </button>
  );
}
