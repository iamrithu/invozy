// Server error reporting without an SDK: every captured error is logged as
// one JSON line (searchable in Vercel's logs), and — when ERROR_WEBHOOK_URL is
// set (a Slack/Discord/Google Chat incoming webhook) — posted there too, at
// most once per 10 minutes per message so a failing loop can't flood it.
// To use Sentry instead, add @sentry/nextjs and call it from here.

const lastSent = new Map<string, number>();
const QUIET_MS = 10 * 60 * 1000;

export async function reportError(err: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined;
  console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), message, digest, stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join(' | ') : undefined, ...context }));

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  const key = message.slice(0, 200);
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - QUIET_MS) return;
  lastSent.set(key, now);
  const where = Object.entries(context)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`)
    .join(' · ');
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` is understood by Slack, Google Chat and (as `content`) Discord.
      body: JSON.stringify({ text: `Invozy error: ${message.slice(0, 500)}${where ? `\n${where}` : ''}`, content: `Invozy error: ${message.slice(0, 500)}` }),
    });
  } catch {
    // the alert channel is down — the log line above still has it
  }
}
