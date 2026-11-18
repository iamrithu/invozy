'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma, rootPrisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { requireModule } from '@/lib/require-module';
import { logActivity } from '@/lib/activity';
import { readStoreSettings, type StoreSettings } from '@/lib/store-settings';
import { slugify } from '@/lib/slug';

// Online store › Storefront and Delivery zones (the owner's side of the
// public store at /s/<storeSlug>).

export type StoreAdmin = {
  slug: string | null;
  suggestedSlug: string;
  enabled: boolean;
  settings: StoreSettings;
  checks: { categoriesShown: number; categoriesWithoutImage: number; productsShown: number; zones: number; hasLogo: boolean; hasPhone: boolean };
  webOrders7d: number;
};

export async function getStoreAdmin(): Promise<StoreAdmin> {
  await requireUser();
  await requireModule('storefront');
  const company = await getCompany();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [cats, productsShown, zones, webOrders7d] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null, status: 'ACTIVE', showOnStore: true }, select: { imageUrl: true, _count: { select: { products: { where: { active: true } } } } } }),
    prisma.product.count({ where: { active: true, categoryRef: { is: { deletedAt: null, status: 'ACTIVE', showOnStore: true } } } }),
    prisma.deliveryZone.count({ where: { active: true } }),
    prisma.order.count({ where: { source: 'WEB', createdAt: { gte: since } } }),
  ]);
  const withProducts = cats.filter((c) => c._count.products > 0);
  return {
    slug: company.storeSlug,
    suggestedSlug: slugify(company.name) || 'my-store',
    enabled: company.storeEnabled,
    settings: readStoreSettings(company.storeSettings),
    checks: {
      categoriesShown: withProducts.length,
      categoriesWithoutImage: withProducts.filter((c) => !c.imageUrl).length,
      productsShown,
      zones,
      hasLogo: !!company.logoUrl,
      hasPhone: !!company.phone,
    },
    webOrders7d,
  };
}

const RESERVED = new Set(['admin', 'api', 'app', 'login', 'signup', 'store', 'www', 'invozy', 'help', 'support']);

const StoreSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use at least 3 characters.')
    .max(40, 'Keep it under 40 characters.')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes.')
    .refine((s) => !RESERVED.has(s), 'That address is reserved. Pick another.'),
  enabled: z.boolean(),
  settings: z.object({
    minOrder: z.coerce.number().min(0).max(10_000_000),
    sameDayCutoff: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a cut-off time.'),
    slots: z.array(z.string().trim().min(1).max(40)).max(12),
    payCod: z.boolean(),
    payUpi: z.boolean(),
    welcome: z.string().trim().max(160),
    contactPhone: z.string().trim().max(20),
  }),
});

export type StoreUpdate = z.input<typeof StoreSchema>;

export async function updateStore(input: StoreUpdate): Promise<ActionResult & { fieldErrors?: Record<string, string> }> {
  try {
    const user = await requireOwner();
    await requireModule('storefront');
    const parsed = StoreSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[i.path.length - 1])] ??= i.message;
      return { error: parsed.error.issues[0]?.message ?? 'Check the store settings.', fieldErrors };
    }
    const d = parsed.data;
    if (d.enabled && !d.settings.payCod && !d.settings.payUpi) return { error: 'Turn on at least one way to pay before opening the store.' };
    const company = await getCompany();
    // Store addresses are unique across every company on Invozy.
    const taken = await rootPrisma.company.findFirst({ where: { storeSlug: d.slug, id: { not: company.id } }, select: { id: true } });
    if (taken) return { error: 'That store address is taken.', fieldErrors: { slug: 'Taken by another business. Try adding your town.' } };
    await prisma.company.update({ where: { id: company.id }, data: { storeSlug: d.slug, storeEnabled: d.enabled, storeSettings: d.settings } });
    await logActivity({ userId: user.id, action: 'store.update', entityType: 'store', entityId: company.id, summary: `${d.enabled ? 'Opened' : 'Updated'} the web store at /s/${d.slug}${d.enabled ? '' : ' (closed)'}` });
    revalidatePath('/storefront');
    revalidatePath(`/s/${d.slug}`);
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

// ── Delivery zones ─────────────────────────────────────────────────────────

export type ZoneRow = { id: string; name: string; pincodes: string[]; charge: number; freeAbove: number | null; minOrder: number; active: boolean };

export async function listZones(): Promise<ZoneRow[]> {
  await requireUser();
  await requireModule('storefront');
  const rows = await prisma.deliveryZone.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return rows.map((z) => ({ id: z.id, name: z.name, pincodes: z.pincodes, charge: Number(z.charge), freeAbove: z.freeAbove == null ? null : Number(z.freeAbove), minOrder: Number(z.minOrder), active: z.active }));
}

const ZoneSchema = z.object({
  name: z.string().trim().min(1, 'Name the zone.').max(60),
  pincodes: z.string(),
  charge: z.coerce.number().min(0, 'The charge can’t be negative.'),
  freeAbove: z.coerce.number().min(0).optional().nullable(),
  minOrder: z.coerce.number().min(0).default(0),
  active: z.boolean().default(true),
});

export type ZoneInput = z.input<typeof ZoneSchema>;

/** PIN codes from free text: any 6-digit runs, de-duplicated. */
function parsePincodes(text: string): { pins: string[]; bad: string[] } {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const pins = Array.from(new Set(tokens.filter((t) => /^\d{6}$/.test(t))));
  return { pins, bad: tokens.filter((t) => !/^\d{6}$/.test(t)) };
}

export async function saveZone(id: string | null, input: ZoneInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireOwner();
    await requireModule('storefront');
    const parsed = ZoneSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the zone.' };
    const d = parsed.data;
    const { pins, bad } = parsePincodes(d.pincodes);
    if (bad.length) return { error: `${bad.slice(0, 3).join(', ')} ${bad.length === 1 ? 'isn’t a' : 'aren’t'} 6-digit PIN code${bad.length === 1 ? '' : 's'}.` };
    if (!pins.length) return { error: 'Add at least one PIN code.' };
    // A PIN code belongs to one zone, so the delivery charge is never ambiguous.
    const others = await prisma.deliveryZone.findMany({ where: { ...(id ? { id: { not: id } } : {}), pincodes: { hasSome: pins } }, select: { name: true, pincodes: true } });
    if (others.length) {
      const clash = pins.filter((p) => others.some((o) => o.pincodes.includes(p)));
      return { error: `${clash.slice(0, 3).join(', ')} ${clash.length === 1 ? 'is' : 'are'} already in ${others[0].name}.` };
    }
    const data = { name: d.name, pincodes: pins, charge: d.charge, freeAbove: d.freeAbove || null, minOrder: d.minOrder, active: d.active };
    const z2 = id ? await prisma.deliveryZone.update({ where: { id }, data }) : await prisma.deliveryZone.create({ data });
    await logActivity({ userId: user.id, action: id ? 'store.zone.update' : 'store.zone.create', entityType: 'store', entityId: z2.id, summary: `${id ? 'Updated' : 'Added'} delivery zone ${d.name} (${pins.length} PIN codes)` });
    revalidatePath('/delivery-zones');
    return { id: z2.id };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteZone(id: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    await requireModule('storefront');
    const z2 = await prisma.deliveryZone.delete({ where: { id }, select: { name: true } });
    await logActivity({ userId: user.id, action: 'store.zone.delete', entityType: 'store', entityId: id, summary: `Deleted delivery zone ${z2.name}` });
    revalidatePath('/delivery-zones');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
