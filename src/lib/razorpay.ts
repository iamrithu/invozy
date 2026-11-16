import { createHmac, timingSafeEqual } from 'node:crypto';

// Razorpay (https://razorpay.com/docs/payments/server-integration/) for
// subscription payments: the server creates an Order, the browser pays it in
// Razorpay Checkout, and the payment is applied only after its signature
// checks out — from the checkout callback or the webhook, whichever is first.
// Configure RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET (and RAZORPAY_WEBHOOK_SECRET
// for the webhook). Without them, online payment is simply unavailable and
// the platform admin records payments by hand.

export function razorpayConfigured(): boolean {
  return !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
}

export function razorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID || null;
}

function secret(): string {
  const s = process.env.RAZORPAY_KEY_SECRET;
  if (!s) throw new Error('Online payment isn’t set up yet.');
  return s;
}

function safeEqualHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Creates an Order for `amountRupees` (INR). */
export async function createOrder(amountRupees: number, receipt: string, notes: Record<string, string>): Promise<{ id: string; amount: number }> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${secret()}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(amountRupees * 100), currency: 'INR', receipt: receipt.slice(0, 40), notes }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as { id?: string; amount?: number; error?: { description?: string } } | null;
  if (!res.ok || !body?.id) throw new Error(body?.error?.description ?? `Couldn’t start the payment (HTTP ${res.status}).`);
  return { id: body.id, amount: body.amount ?? Math.round(amountRupees * 100) };
}

/** Checkout's callback signature: HMAC-SHA256(order_id|payment_id, key secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac('sha256', secret()).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret || !signature) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
