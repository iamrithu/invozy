import { computeTotals, type TotalsResult } from '@/lib/gst';

// The order pricing engine: one pure function used by the order form's
// preview, the server actions that save orders, and the web store checkout.
// It never touches the database — callers pass in the discounts that are
// live for this order (active, in date, on this channel, within their usage
// limits). The invoice generated from an order is built from the same
// numbers (src/actions/orders.ts → invoiceInputFromOrder), so the two match:
//
//   line price → line discount % → best automatic discount → coupon →
//   delivery charge → GST on the taxable value → round off.
//
// Discounts come off before GST: on the invoice they become its existing
// flat bill discount, which computeTotals() takes off the taxable value.

export type PriceLine = {
  productId: string | null;
  categoryId: string | null;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  /** Line discount %. */
  discount: number;
};

export type DiscountRule = {
  id: string;
  code: string | null;
  title: string;
  kind: 'PERCENT' | 'FLAT' | 'FREE_DELIVERY';
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  scope: 'ALL' | 'CATEGORIES';
  categoryIds: string[];
  combinable: boolean;
};

export type GstSetup = {
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
};

export type PriceInput = {
  lines: PriceLine[];
  deliveryCharge: number;
  /** Live automatic discounts; the best one that qualifies is applied. */
  automatic: DiscountRule[];
  /** The coupon the customer entered, already checked for status, dates,
   * channel and usage limits by the caller. */
  coupon: DiscountRule | null;
  gst: GstSetup;
  companyState: string;
  customerState: string;
};

export type PriceResult = {
  /** Each line's amount after its own discount. */
  lineNets: number[];
  /** Sum of lineNets: the goods, before order-level discounts. */
  subtotal: number;
  auto: { rule: DiscountRule; amount: number } | null;
  coupon: { rule: DiscountRule; amount: number; freeDelivery: boolean } | null;
  /** Why the entered coupon doesn't apply to this order, as a sentence. */
  couponError: string | null;
  /** After a free-delivery coupon. */
  deliveryCharge: number;
  deliveryWaived: number;
  /** autoDiscount + couponDiscount: the invoice's flat bill discount. */
  billDiscount: number;
  totals: TotalsResult;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** What a rule takes off `base` (the goods it covers), capped. */
function ruleAmount(rule: DiscountRule, base: number): number {
  if (base <= 0) return 0;
  if (rule.kind === 'PERCENT') return r2(Math.min((base * rule.value) / 100, rule.maxDiscount ?? Infinity));
  if (rule.kind === 'FLAT') return r2(Math.min(rule.value, base));
  return 0;
}

/** The goods a rule covers: everything, or the lines in its categories. */
function ruleBase(rule: DiscountRule, lines: PriceLine[], nets: number[]): number {
  if (rule.scope === 'ALL') return nets.reduce((a, b) => a + b, 0);
  return lines.reduce((sum, l, i) => (l.categoryId && rule.categoryIds.includes(l.categoryId) ? sum + nets[i] : sum), 0);
}

export function priceOrder(input: PriceInput): PriceResult {
  const lineNets = input.lines.map((l) => r2(l.qty * l.rate * (1 - (l.discount || 0) / 100)));
  const subtotal = r2(lineNets.reduce((a, b) => a + b, 0));

  // Best automatic discount that qualifies (minimum checked on the goods).
  let auto: PriceResult['auto'] = null;
  for (const rule of input.automatic) {
    if (rule.kind === 'FREE_DELIVERY' || subtotal < rule.minOrderValue) continue;
    const amount = ruleAmount(rule, ruleBase(rule, input.lines, lineNets));
    if (amount > 0 && (!auto || amount > auto.amount)) auto = { rule, amount };
  }

  let coupon: PriceResult['coupon'] = null;
  let couponError: string | null = null;
  const afterAuto = r2(subtotal - (auto?.amount ?? 0));
  const c = input.coupon;
  if (c) {
    const base = ruleBase(c, input.lines, lineNets);
    if (auto && !c.combinable) couponError = `${c.code ?? c.title} can’t be used with the ${auto.rule.title} discount on this order.`;
    else if (afterAuto < c.minOrderValue) couponError = `Add ${inr(r2(c.minOrderValue - afterAuto))} more to use ${c.code ?? c.title} (minimum order ${inr(c.minOrderValue)}).`;
    else if (c.scope === 'CATEGORIES' && base <= 0) couponError = `${c.code ?? c.title} only applies to some categories, and this order has none of them.`;
    else if (c.kind === 'FREE_DELIVERY') coupon = { rule: c, amount: 0, freeDelivery: true };
    else {
      // Never more than what's left after the automatic discount.
      const amount = Math.min(ruleAmount(c, base), afterAuto);
      if (amount > 0) coupon = { rule: c, amount: r2(amount), freeDelivery: false };
      else couponError = `${c.code ?? c.title} doesn’t take anything off this order.`;
    }
  }

  const fullDelivery = Math.max(r2(input.deliveryCharge || 0), 0);
  const deliveryCharge = coupon?.freeDelivery ? 0 : fullDelivery;
  const billDiscount = r2((auto?.amount ?? 0) + (coupon?.amount ?? 0));

  // Same maths as the invoice: lines (plus delivery as its own line), a flat
  // bill discount, then GST.
  const totals = computeTotals(
    [...input.lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount })), ...(deliveryCharge > 0 ? [{ qty: 1, rate: deliveryCharge, discount: 0 }] : [])],
    { type: 'FLAT', value: billDiscount },
    input.gst,
    input.companyState,
    input.customerState
  );

  return { lineNets, subtotal, auto, coupon, couponError, deliveryCharge, deliveryWaived: coupon?.freeDelivery ? fullDelivery : 0, billDiscount, totals };
}

/** "Net 15" → 15 days after `from`; anything else is due the same day. */
export function dueDateFromTerms(terms: string | null | undefined, from: string): string {
  const m = /net\s*(\d{1,3})/i.exec(terms ?? '');
  if (!m) return from;
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(m[1]));
  return d.toISOString().slice(0, 10);
}
