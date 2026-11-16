import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { currentCompanyId } from './tenant';
import { DEFAULT_PDF_LAYOUT, normalizePdfLayout, type PdfLayout } from './pdf-layout';

// Per-company settings kept in the AppSetting key/value table rather than
// as Company columns. The point is deploy safety: code ships to Vercel the
// moment `main` is pushed, but the migration that creates AppSetting only
// lands when the owner runs `npm run db:deploy`. A missing *column* on
// Company would break every Company query in that window; a missing *table*
// here just means "use the defaults" — reads below never throw for it.

export type PdfItemRows = 'none' | 'lines' | 'zebra';

export type AppSettings = {
  /** Monthly sales target in ₹ (net sales), or null when not set. */
  monthlySalesTarget: number | null;
  /** How product rows are separated on CLEAN-style documents: column rules
   * only (default), a thin line between rows, or light alternate shading. */
  pdfItemRows: PdfItemRows;
  /** Margins, row spacing, rows per page and the page furniture of every
   * printed document (src/lib/pdf-layout.ts). */
  pdfLayout: PdfLayout;
};

export const DEFAULT_SETTINGS: AppSettings = { monthlySalesTarget: null, pdfItemRows: 'none', pdfLayout: DEFAULT_PDF_LAYOUT };

const KEYS = { monthlySalesTarget: 'sales.monthlyTarget', pdfItemRows: 'pdf.itemRows', pdfLayout: 'pdf.layout' } as const;

/** P2021 = "table does not exist" — the migration hasn't been applied yet. */
export function isMissingTable(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021';
}

let warned = false;
function warnMissing(err: unknown) {
  if (warned) return;
  warned = true;
  console.warn('AppSetting table unavailable — using default settings until `npm run db:deploy` runs.', err instanceof Error ? err.message.split('\n')[0] : err);
}

function parse(rows: { key: string; value: Prisma.JsonValue }[]): AppSettings {
  const by = new Map(rows.map((r) => [r.key, r.value]));
  const target = by.get(KEYS.monthlySalesTarget);
  const rowsStyle = by.get(KEYS.pdfItemRows);
  return {
    monthlySalesTarget: typeof target === 'number' && target > 0 ? target : null,
    pdfItemRows: rowsStyle === 'lines' || rowsStyle === 'zebra' ? rowsStyle : 'none',
    pdfLayout: normalizePdfLayout(by.get(KEYS.pdfLayout)),
  };
}

/** Every setting, defaulted. Never throws — a database hiccup or a not-yet-
 * migrated database gives the defaults rather than a broken page. */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
    return parse(rows);
  } catch (err) {
    warnMissing(err);
    return DEFAULT_SETTINGS;
  }
}

/** Upserts one setting. Throws a plain, readable Error when the table
 * doesn't exist yet, so the caller's toActionError shows it as-is. */
export async function setAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  try {
    if (value === null) await prisma.appSetting.deleteMany({ where: { key: KEYS[key] } });
    else {
      const id = { companyId: await currentCompanyId(), key: KEYS[key] };
      await prisma.appSetting.upsert({ where: { companyId_key: id }, create: { key: KEYS[key], value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
    }
  } catch (err) {
    if (isMissingTable(err)) throw new Error('This setting needs the latest database update. Run `npm run db:deploy`, then try again.');
    throw err;
  }
}

/** Per-user flags stored under their own keys (e.g. the daily summary
 * opt-out). Defaulted, never throwing on reads. */
export async function getUserFlag(userId: string, name: string, fallback: boolean): Promise<boolean> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { companyId_key: { companyId: await currentCompanyId(), key: `user.${userId}.${name}` } } });
    return typeof row?.value === 'boolean' ? row.value : fallback;
  } catch (err) {
    warnMissing(err);
    return fallback;
  }
}

export async function setUserFlag(userId: string, name: string, value: boolean): Promise<void> {
  try {
    const key = `user.${userId}.${name}`;
    await prisma.appSetting.upsert({ where: { companyId_key: { companyId: await currentCompanyId(), key } }, create: { key, value }, update: { value } });
  } catch (err) {
    if (isMissingTable(err)) throw new Error('This setting needs the latest database update. Run `npm run db:deploy`, then try again.');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Dashboard setup checklist (src/lib/setup-checklist.ts) — per company.
// ---------------------------------------------------------------------------

const CHECKLIST_KEY = 'onboarding.checklist';

export type ChecklistState = {
  /** The owner hid the checklist for good. */
  dismissed: boolean;
  /** Items the owner ticked by hand — only ones that can't be detected from
   * data (e.g. "I'm happy with the default invoice design"). */
  marked: string[];
};

/** The checklist's saved state, defaulted. Never throws. */
export async function getChecklistState(): Promise<ChecklistState> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { companyId_key: { companyId: await currentCompanyId(), key: CHECKLIST_KEY } } });
    const v = row?.value as { dismissed?: unknown; marked?: unknown } | null | undefined;
    return {
      dismissed: v?.dismissed === true,
      marked: Array.isArray(v?.marked) ? v.marked.filter((m): m is string => typeof m === 'string') : [],
    };
  } catch (err) {
    warnMissing(err);
    return { dismissed: false, marked: [] };
  }
}

export async function setChecklistState(state: ChecklistState): Promise<void> {
  try {
    const value = { dismissed: state.dismissed, marked: [...new Set(state.marked)] } as Prisma.InputJsonValue;
    await prisma.appSetting.upsert({
      where: { companyId_key: { companyId: await currentCompanyId(), key: CHECKLIST_KEY } },
      create: { key: CHECKLIST_KEY, value },
      update: { value },
    });
  } catch (err) {
    if (isMissingTable(err)) throw new Error('This setting needs the latest database update. Run `npm run db:deploy`, then try again.');
    throw err;
  }
}

/** Whether the company has saved its own PDF layout (Company → PDF layout),
 * rather than living with the defaults. Never throws. */
export async function hasSavedPdfLayout(): Promise<boolean> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { companyId_key: { companyId: await currentCompanyId(), key: KEYS.pdfLayout } }, select: { key: true } });
    return !!row;
  } catch (err) {
    warnMissing(err);
    return false;
  }
}

