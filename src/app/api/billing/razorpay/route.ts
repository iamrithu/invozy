import { verifyWebhookSignature } from '@/lib/razorpay';
import { applyPaidOrder } from '@/lib/subscription-apply';
import { logPlatformAction } from '@/lib/platform-audit';

export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook (Dashboard → Webhooks → this URL, events `payment.captured`
 * and `order.paid`, secret = RAZORPAY_WEBHOOK_SECRET). The backstop for a
 * checkout whose browser callback never arrived (tab closed after paying).
 * Only signature-verified events are acted on, and only for orders this app
 * created; applying an order twice is a no-op.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature'))) {
    return Response.json({ error: 'Bad signature' }, { status: 400 });
  }
  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const payment = event.payload?.payment?.entity;
  if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id && payment.id) {
    const result = await applyPaidOrder(payment.order_id, payment.id);
    if (result === 'applied') {
      await logPlatformAction({ actor: 'razorpay-webhook', action: 'subscription.paid', targetId: payment.order_id, summary: `Payment ${payment.id} applied for order ${payment.order_id}` });
    }
    return Response.json({ ok: true, result });
  }
  return Response.json({ ok: true, ignored: event.event ?? 'unknown' });
}
