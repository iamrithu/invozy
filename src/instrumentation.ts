import type { Instrumentation } from 'next';

/** Every server error Next captures (pages, server actions, route handlers)
 * goes to src/lib/error-report.ts — a JSON log line, plus an alert when
 * ERROR_WEBHOOK_URL is set. No company data is sent: only the message, the
 * route and the request path. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { reportError } = await import('./lib/error-report');
  await reportError(err, { method: request.method, path: request.path.split('?')[0], route: context.routePath, kind: context.routeType });
};
