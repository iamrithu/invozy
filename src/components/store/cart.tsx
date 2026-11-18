'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// The web store cart: product + unit + quantity, kept in this browser per
// store. Prices are shown from the catalog but always re-priced on the
// server at checkout (src/actions/store.ts).

export type CartLine = { productId: string; unit: string; qty: number };

type Cart = {
  lines: CartLine[];
  ready: boolean;
  set: (productId: string, unit: string, qty: number) => void;
  clear: () => void;
  count: number;
};

const CartContext = createContext<Cart | null>(null);

export function CartProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const key = `invozy-cart:${slug}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
      if (Array.isArray(parsed)) setLines(parsed.filter((l) => l && typeof l.productId === 'string' && l.qty > 0));
    } catch {
      /* private window or blocked storage: start empty */
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(lines));
    } catch {
      /* not saved; the cart still works for this visit */
    }
  }, [key, lines, ready]);

  const set = useCallback((productId: string, unit: string, qty: number) => {
    setLines((ls) => {
      const rest = ls.filter((l) => !(l.productId === productId && l.unit === unit));
      return qty > 0 ? [...rest, { productId, unit, qty: Math.min(qty, 100000) }] : rest;
    });
  }, []);
  const clear = useCallback(() => setLines([]), []);
  const value = useMemo(() => ({ lines, ready, set, clear, count: lines.reduce((n, l) => n + l.qty, 0) }), [lines, ready, set, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart {
  const c = useContext(CartContext);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
}
