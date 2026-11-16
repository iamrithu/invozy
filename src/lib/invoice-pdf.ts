import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { put, del } from '@vercel/blob';
import { prisma } from './prisma';
import { currentCompanyId, findCompanyId, isViewOnly, runWithTenant } from './tenant';
import { createSignedToken, invoiceShareToken } from './signed-token';
import { getSharedPdfContext, PDF_PAGE, viewportFor } from './pdf-browser';
import { getAppSettings } from './settings';
import type { PdfLayout } from './pdf-layout';
import { configuredSiteOrigin } from './site-origin';

// ---------------------------------------------------------------------------
// Invoice PDFs: render once, store, serve the stored file.
//
// Every PDF used to be rendered on demand — launch/reuse Chromium, open a
// fresh context, forward the user's cookies, load the whole app page
// (shell, tour, Redux, session fetch) and wait for network idle — so View
// PDF → Download → Print paid for 2–3 identical renders, each close to the
// function's time limit. Now:
//
// - A slim, shell-less print page (src/app/print/invoices/[id]) renders the
//   sheet, authenticated by a short-lived signed token instead of cookies.
// - The result is stored (Vercel Blob, or local disk in dev) under a key
//   hashed from everything the PDF is drawn from (computePdfKey), and the
//   key is saved on the invoice. A request whose key still matches streams
//   the stored file; anything else rebuilds it.
// - Saving an invoice schedules a background rebuild (schedulePdfBuild), so
//   the first Download after a save is normally already instant.
//
// Invoice rendering happens inside /api/invoices/[id]/pdf: a function with
// Chromium traced into its bundle (next.config.js outputFileTracingIncludes)
// and the 2048MB it needs (vercel.json). Server actions and the public
// share link reach it over HTTP with a signed 'pdf-build' token rather
// than launching a browser themselves (page functions have neither).
// ---------------------------------------------------------------------------

/** Bump whenever the printed output changes for the same data (template
 * markup, CSS, footer, margins) so every stored PDF is rebuilt with it. */
export const RENDER_VERSION = '2026-11-16.column-rules';

/** Everything after the browser is up — navigation, layout, pdf() — must
 * fit in this, leaving the rest of the function's 60s for a cold launch
 * and the upload. */
const RENDER_BUDGET_MS = 20_000;
const PRINT_TOKEN_TTL_S = 120;
const BUILD_TOKEN_TTL_S = 300;

export class PdfNotFoundError extends Error {
  constructor() {
    super('Invoice not found.');
  }
}

export type PdfKeyInput = {
  updatedAt: Date;
  customer: { updatedAt: Date };
  company: { updatedAt: Date; invoiceTemplate: string };
};

/** The stored PDF's cache key. Invoice.updatedAt moves on every edit,
 * payment, e-Invoice/e-Way Bill result; Customer.updatedAt on a buyer
 * address/GSTIN change (the buyer block reads the live customer row);
 * Company.updatedAt on any profile/logo/template change. pdfUrl/pdfKey are
 * written with raw SQL (see savePdfPointer) precisely so that writing the
 * key doesn't itself bump Invoice.updatedAt and invalidate it. */
export function computePdfKey(input: PdfKeyInput): string {
  return createHash('sha1')
    .update(
      [
        input.updatedAt.toISOString(),
        input.customer.updatedAt.toISOString(),
        input.company.updatedAt.toISOString(),
        input.company.invoiceTemplate,
        RENDER_VERSION,
      ].join('|')
    )
    .digest('hex');
}

/** "INV/26-27/1020" → "INV-26-27-1020.pdf" (also mirrored client-side in
 * download-pdf-button.tsx's invoicePdfFileName). */
export function invoicePdfFileName(invoiceNumber: string): string {
  return `${invoiceNumber.replace(/[\\/]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
}

/** Public, sign-in-free link to this invoice's PDF (valid 180 days) — for
 * sending to the customer, e.g. on WhatsApp. Prefix with the site origin. */
export async function invoiceSharePath(invoiceId: string): Promise<string> {
  return `/api/share/${await invoiceShareToken(invoiceId)}`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export type RenderOptions = {
  /** Site origin the headless browser loads the print page from. Defaults
   * to the current request's host (route handlers/server actions), then
   * AUTH_URL / Vercel's URLs. */
  origin?: string;
  /** Footer, left side — plain text (no ₹: the footer can't use the page's
   * web fonts, see below). */
  footerLeft?: string;
  /** Footer, right side before "Page X of Y" — e.g. the document number. */
  footerRight?: string;
  /** Paper margins and page footer; read from Company → PDF layout when
   * not given. */
  layout?: PdfLayout;
};

/** Renders one print page (e.g. `/print/invoices/<id>?t=<token>`) to an A4
 * PDF via the shared headless browser. Reusable for any document with a
 * print page under src/app/print — the page must authenticate itself (a
 * signed token in the URL; this browser has no session) and set
 * `data-pdf-ready="true"` on an element once its layout is final.
 *
 * Must run inside a route handler that has Chromium traced into its
 * function (next.config.js outputFileTracingIncludes) and 2048MB
 * (vercel.json) — /api/invoices/[id]/pdf and the /api/pdf/** document
 * routes. Throws a readable Error on failure or when the page isn't ready
 * within RENDER_BUDGET_MS. */
export async function renderPrintPage(pagePath: string, opts: RenderOptions = {}): Promise<Buffer> {
  const origin = opts.origin ?? (await requestOrigin());
  if (!origin) throw new Error('PDF render failed: could not work out this site’s address (set AUTH_URL).');
  // Never echo the token into logs/errors.
  const label = pagePath.split('?')[0];

  const layout = opts.layout ?? (await getAppSettings()).pdfLayout;
  const context = await getSharedPdfContext();
  const page = await context.newPage();
  const startedAt = Date.now();
  const remaining = () => Math.max(1_000, RENDER_BUDGET_MS - (Date.now() - startedAt));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const render = (async () => {
      // Print media before navigating, not after: the sheet measures its
      // sections on mount (print-pagination.tsx), and `print:` styles
      // change those sections' padding/borders.
      await page.emulateMedia({ media: 'print' });
      // Lay out at the content width these margins leave, so what the sheet
      // measures is what prints.
      await page.setViewportSize(viewportFor(layout));
      // 'load', not 'networkidle': the print page's images are inlined
      // data URLs (decoded by 'load'), and the readiness marker below is
      // the real layout signal — waiting for the network to go quiet (the
      // session provider's background fetch included) only added seconds.
      const res = await page.goto(origin + pagePath, { waitUntil: 'load', timeout: remaining() });
      if (!res || !res.ok()) throw new Error(`print page ${label} answered HTTP ${res?.status() ?? 'no response'}`);
      // `state: 'attached'` — the marker is display:none, so the default
      // 'visible' would never resolve.
      await page.waitForSelector('[data-pdf-ready="true"]', { state: 'attached', timeout: remaining() });
      return page.pdf({
        format: PDF_PAGE.format,
        printBackground: true,
        // Chromium's own pageNumber/totalPages are computed after layout,
        // so this is right even when the closing block overflows onto an
        // extra page by itself. The footer is rendered in a separate
        // document that can't load the page's web fonts — generic font
        // stack only, and nothing that needs a ₹ glyph.
        displayHeaderFooter: layout.pageFooter,
        headerTemplate: '<span></span>',
        footerTemplate: footerTemplate(layout, opts.footerLeft ?? 'This is a computer-generated document.', opts.footerRight),
        margin: {
          top: `${layout.marginTop}mm`,
          bottom: `${layout.marginBottom}mm`,
          left: `${layout.marginLeft}mm`,
          right: `${layout.marginRight}mm`,
        },
      });
    })();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${RENDER_BUDGET_MS / 1000}s`)), RENDER_BUDGET_MS);
    });
    render.catch(() => {}); // the race below reports it; don't leave it unhandled after a timeout
    return Buffer.from(await Promise.race([render, timeout]));
  } catch (e) {
    throw new Error(`PDF render of ${label} failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
    await page.close().catch(() => {});
  }
}

function footerTemplate(layout: PdfLayout, left: string, right?: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `
    <div style="width:100%;display:flex;justify-content:space-between;padding:0 ${layout.marginRight}mm 0 ${layout.marginLeft}mm;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:8px;color:#4b5563;">
      <span>${esc(left)}</span>
      <span>${right ? `${esc(right)} · ` : ''}Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;
}

/** The configured site origin (src/lib/site-origin.ts) when set, else the
 * current request's own origin (route handler or server action), else a
 * platform default. Never throws — null when nothing is known. */
async function requestOrigin(): Promise<string | null> {
  const configured = configuredSiteOrigin();
  if (configured) return configured;
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) {
      const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https');
      return `${proto}://${host}`;
    }
  } catch {
    // Outside a request (scripts) — fall through to configuration.
  }
  return configuredOrigin();
}

function configuredOrigin(): string | null {
  const explicit = configuredSiteOrigin();
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return process.env.NODE_ENV === 'production' ? null : `http://localhost:${process.env.PORT || 3000}`;
}

// ---------------------------------------------------------------------------
// Storage — Vercel Blob when connected (same switch as src/lib/uploads.ts),
// otherwise local disk: .next/cache in dev, /tmp on a serverless host
// without Blob (per-instance only, so it just saves repeat renders there).
// ---------------------------------------------------------------------------

const LOCAL_PREFIX = 'local:';
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const LOCAL_DIR = isServerless ? path.join(os.tmpdir(), 'invozy-pdfs') : path.join(process.cwd(), '.next', 'cache', 'pdfs');

function useBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function localPath(name: string): string | null {
  return /^[\w.-]+$/.test(name) ? path.join(LOCAL_DIR, name) : null;
}

async function storePdf(name: string, pdf: Buffer): Promise<string> {
  if (useBlob()) {
    // Public like every other upload here, but the random suffix makes the
    // URL unguessable; it's only ever handed out through our own routes.
    const blob = await put(`pdfs/${name}`, pdf, { access: 'public', contentType: 'application/pdf', addRandomSuffix: true });
    return blob.url;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, name), pdf);
  return LOCAL_PREFIX + name;
}

async function readStoredPdf(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith(LOCAL_PREFIX)) {
      const file = localPath(url.slice(LOCAL_PREFIX.length));
      return file ? await fs.readFile(file) : null;
    }
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null; // gone (e.g. a different instance's /tmp) — the caller rebuilds
  }
}

/** Best-effort, never throws — same contract as deleteUploadedImage. */
async function deleteStoredPdf(url: string): Promise<void> {
  try {
    if (url.startsWith(LOCAL_PREFIX)) {
      const file = localPath(url.slice(LOCAL_PREFIX.length));
      if (file) await fs.unlink(file);
    } else if (url.includes('blob.vercel-storage.com')) {
      await del(url);
    }
  } catch {
    // already gone
  }
}

/** Points the invoice at its new PDF and returns the one it replaces.
 * Raw SQL on purpose: Prisma's @updatedAt is applied client-side, so this
 * leaves Invoice.updatedAt — part of the key being saved — untouched. */
async function savePdfPointer(invoiceId: string, url: string, key: string): Promise<{ found: boolean; previousUrl: string | null }> {
  const rows = await prisma.$queryRaw<{ previousUrl: string | null }[]>`
    UPDATE "Invoice" AS i SET "pdfUrl" = ${url}, "pdfKey" = ${key}
    FROM (SELECT "id", "pdfUrl" FROM "Invoice" WHERE "id" = ${invoiceId} AND "companyId" = ${await currentCompanyId()}) AS o
    WHERE i."id" = o."id"
    RETURNING o."pdfUrl" AS "previousUrl"`;
  return { found: rows.length > 0, previousUrl: rows[0]?.previousUrl ?? null };
}

// ---------------------------------------------------------------------------
// Invoice PDFs
// ---------------------------------------------------------------------------

async function loadPdfMeta(invoiceId: string) {
  const [invoice, company] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, number: true, updatedAt: true, pdfUrl: true, pdfKey: true, customer: { select: { updatedAt: true } } },
    }),
    prisma.company.findUnique({ where: { id: await currentCompanyId() }, select: { updatedAt: true, invoiceTemplate: true } }),
  ]);
  if (!invoice || !company) throw new PdfNotFoundError();
  return { ...invoice, key: computePdfKey({ ...invoice, company }) };
}

type PdfMeta = Awaited<ReturnType<typeof loadPdfMeta>>;

/** Renders in flight in this process, by invoice+key — a Download clicked
 * while the post-save prebuild is still running waits for that render
 * instead of starting a second one. */
const inflight = new Map<string, Promise<Buffer>>();

function buildFromMeta(meta: PdfMeta, opts: RenderOptions): Promise<Buffer> {
  const id = `${meta.id}:${meta.key}`;
  let job = inflight.get(id);
  if (!job) {
    job = (async () => {
      const token = await createSignedToken('print-invoice', meta.id, PRINT_TOKEN_TTL_S);
      const pdf = await renderPrintPage(`/print/invoices/${encodeURIComponent(meta.id)}?t=${encodeURIComponent(token)}`, {
        ...opts,
        footerLeft: opts.footerLeft ?? 'This is a computer-generated invoice.',
        footerRight: opts.footerRight ?? meta.number,
      });
      // Viewing as the platform admin is read-only: hand the PDF over, store nothing.
      if (await isViewOnly()) return pdf;
      try {
        const url = await storePdf(`${meta.id}-${meta.key}.pdf`, pdf);
        const { found, previousUrl } = await savePdfPointer(meta.id, url, meta.key);
        if (!found) await deleteStoredPdf(url); // invoice deleted mid-render
        else if (previousUrl && previousUrl !== url) await deleteStoredPdf(previousUrl);
      } catch (e) {
        // Storage is an optimisation — the caller still gets its PDF.
        console.error(`Storing the PDF for invoice ${meta.id} failed`, e);
      }
      return pdf;
    })().finally(() => inflight.delete(id));
    inflight.set(id, job);
  }
  return job;
}

/** Renders the invoice's PDF now, stores it (replacing the previous one)
 * and returns it. Prefer getInvoicePdf, which skips the render when the
 * stored copy is current. Chromium-bundled functions only. */
export async function buildInvoicePdf(invoiceId: string, opts: RenderOptions = {}): Promise<Buffer> {
  return buildFromMeta(await loadPdfMeta(invoiceId), opts);
}

/** The invoice's PDF — the stored file when it's current, otherwise a
 * fresh render (which is then stored). Throws PdfNotFoundError for an
 * unknown invoice. Chromium-bundled functions only (see top of file). */
export async function getInvoicePdf(invoiceId: string, opts: RenderOptions = {}): Promise<{ buffer: Buffer; number: string }> {
  const meta = await loadPdfMeta(invoiceId);
  if (meta.pdfUrl && meta.pdfKey === meta.key) {
    const stored = await readStoredPdf(meta.pdfUrl);
    if (stored) return { buffer: stored, number: meta.number };
  }
  return { buffer: await buildFromMeta(meta, opts), number: meta.number };
}

/** Builds the stored PDF only if it's missing or stale — the prebuild path,
 * which has no use for the bytes. */
export async function ensureInvoicePdf(invoiceId: string, opts: RenderOptions = {}): Promise<void> {
  const meta = await loadPdfMeta(invoiceId);
  if (meta.pdfUrl && meta.pdfKey === meta.key) return;
  await buildFromMeta(meta, opts);
}

/** The stored PDF if it's current, else null — never renders, so it's safe
 * in any function (the share link uses it before falling back to the
 * renderer over HTTP). */
export async function getStoredInvoicePdf(invoiceId: string): Promise<{ buffer: Buffer; number: string } | null> {
  const meta = await loadPdfMeta(invoiceId);
  if (!meta.pdfUrl || meta.pdfKey !== meta.key) return null;
  const buffer = await readStoredPdf(meta.pdfUrl);
  return buffer ? { buffer, number: meta.number } : null;
}

/** Asks the renderer route (POST /api/invoices/[id]/pdf, which has
 * Chromium) for this invoice's PDF. `wait: true` answers with the PDF
 * itself; otherwise the route answers 202 at once and builds after
 * responding. */
export async function requestPdfFromRenderer(invoiceId: string, opts: { origin?: string; wait?: boolean } = {}): Promise<Response> {
  const origin = opts.origin ?? (await requestOrigin());
  if (!origin) throw new Error('Could not work out this site’s address (set AUTH_URL).');
  const token = await createSignedToken('pdf-build', invoiceId, BUILD_TOKEN_TTL_S);
  return fetch(`${origin}/api/invoices/${encodeURIComponent(invoiceId)}/pdf${opts.wait ? '?wait=1' : ''}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
}

/** Queues a background (re)build of an invoice's stored PDF after the
 * current response is sent, so the next View/Download is instant. Safe to
 * call from any server action or route handler; never throws into the
 * caller and never delays its response.
 *
 * The render itself runs in the PDF route's function (it has Chromium and
 * the memory for it — server actions run in page functions, which have
 * neither): this only fires a signed request at it, and the route builds
 * after answering 202, so the action's own after() finishes in
 * milliseconds. */
export function schedulePdfBuild(invoiceId: string): void {
  try {
    // Read the request's host now — inside after() it may no longer be
    // available (Server Components can't read headers there at all).
    const origin = requestOrigin();
    // Same for the company: after() may run outside this request's context
    // (no session, no runWithTenant), so it's captured now and re-entered.
    const companyId = findCompanyId();
    after(async () => {
      try {
        const cid = await companyId;
        if (!cid) return;
        const res = await runWithTenant(cid, async () => requestPdfFromRenderer(invoiceId, { origin: (await origin) ?? undefined }));
        await res.body?.cancel();
        if (!res.ok) console.error(`PDF prebuild for invoice ${invoiceId} was refused: HTTP ${res.status}`);
      } catch (e) {
        console.error(`PDF prebuild for invoice ${invoiceId} failed`, e);
      }
    });
  } catch (e) {
    // Called outside a request scope — nothing to hang the work on. The
    // PDF is simply built on first request instead.
    console.error('schedulePdfBuild: no request scope', e);
  }
}

/** Removes stored invoice PDFs by URL — for a permanent company deletion. */
export async function deleteStoredPdfs(urls: string[]): Promise<void> {
  for (const url of urls) await deleteStoredPdf(url);
}
