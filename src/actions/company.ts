'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { toPublicCompany } from '@/lib/public-company';
import { saveUploadedImage, deleteUploadedImage } from '@/lib/uploads';
import { isValidThemeColor } from '@/lib/theme-presets';
import { encryptSecret } from '@/lib/secret';
import { recomputeStoredTotals } from '@/lib/invoice-totals';

const CompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional().nullable(),
  // Optional to match the nullable DB columns — the setup script only
  // requires name + state, and each Company settings save submits every tab's
  // fields together, so requiring all of them would block saving just the
  // business name until GST/banking details exist too.
  address: z.string().optional().nullable(),
  state: z.string().min(1),
  district: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  altPhone: z.string().optional().nullable(),
  // No `email` here on purpose — it's exclusively derived from the signed-in
  // user's account email (see src/actions/account.ts's updateMyProfile),
  // so there's exactly one place to change it and it can never drift.
  bankName: z.string().optional().nullable(),
  bankAcc: z.string().optional().nullable(),
  ifsc: z.string().optional().nullable(),
  branch: z.string().optional().nullable(),
  upi: z.string().optional().nullable(),
  cgstRate: z.coerce.number().min(0).max(100),
  sgstRate: z.coerce.number().min(0).max(100),
  igstRate: z.coerce.number().min(0).max(100),
  cgstEnabled: z.coerce.boolean(),
  sgstEnabled: z.coerce.boolean(),
  igstEnabled: z.coerce.boolean(),
  invoicePrefix: z.string().min(1),
  invoiceFY: z.string().min(1),
  nextInvoiceNo: z.coerce.number().int().min(1),
  terms: z.string().optional().nullable(),
  themeColor: z.string().refine(isValidThemeColor, 'Invalid theme color').optional(),
  // A change here also bumps Company.updatedAt, which is part of every
  // stored invoice PDF's key (src/lib/invoice-pdf.ts) — so each PDF is
  // re-rendered in the new template the next time it's opened or saved.
  invoiceTemplate: z.enum(['MODERN', 'CLASSIC', 'CLEAN']).optional(),
  fssaiNo: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  // Per-company currency + PDF-handling toggles — plain fields, no
  // encryption needed (not secrets), same path as invoiceTemplate/cgstEnabled.
  currency: z.string().min(1).optional(),
  pdfShowBankDetails: z.coerce.boolean().optional(),
  pdfShowHsnSummary: z.coerce.boolean().optional(),
  // Display only — see schema.prisma's comment on Company.pdfShowItemDiscount.
  pdfShowItemDiscount: z.coerce.boolean().optional(),
  pdfShowBillDiscount: z.coerce.boolean().optional(),
  // See schema.prisma's comment on Company.defaultHsn.
  defaultHsn: z.string().trim().min(1, 'Required').optional(),
  // See schema.prisma's comment on Company.showUpiQr/showGpayNumber —
  // independent toggles, not mutually exclusive.
  showUpiQr: z.coerce.boolean().optional(),
  showGpayNumber: z.coerce.boolean().optional(),
  // NIC e-Invoice/e-Way Bill sandbox (or production) credentials — all
  // optional, a company may not have registered yet. Password/client
  // secret are handled outside this schema (see updateCompany below): an
  // empty submission means "keep the existing encrypted value", so they
  // can't just be required/optional strings validated here.
  nicSandbox: z.coerce.boolean().optional(),
  nicUsername: z.string().optional().nullable(),
  nicClientId: z.string().optional().nullable(),
  // CLASSIC template's Authorised Signatory row — optional, blank means the
  // printed row stays blank for physical signing.
  signatoryName: z.string().optional().nullable(),
});

export type CompanyFormState = { error?: string; fieldErrors?: Record<string, string> };

/** A server action is a public endpoint, so this never returns the
 * encrypted NIC credentials — only whether each one is saved. */
export async function getCompanyProfile() {
  return toPublicCompany(await getCompany());
}

const SWITCHES = [
  'cgstEnabled',
  'sgstEnabled',
  'igstEnabled',
  'nicSandbox',
  'pdfShowBankDetails',
  'pdfShowHsnSummary',
  'pdfShowItemDiscount',
  'pdfShowBillDiscount',
  'showUpiQr',
  'showGpayNumber',
] as const;

type CompanyField = keyof typeof CompanySchema.shape;

export async function updateCompany(_prev: CompanyFormState, formData: FormData): Promise<CompanyFormState> {
  const raw: Record<string, unknown> = Object.fromEntries(formData);
  // The Company page saves one section at a time and lists the fields that
  // section owns in `_fields` — only those are validated and written, so
  // saving the bank details can't roll back the live invoice counter or
  // switch off a toggle from another section (an unchecked switch simply
  // isn't in FormData). Without `_fields`, every field is required as before.
  const only =
    typeof raw._fields === 'string' ? raw._fields.split(',').filter((k): k is CompanyField => k in CompanySchema.shape) : null;
  for (const k of SWITCHES) {
    if (!only || only.includes(k)) raw[k] = raw[k] === 'on' || raw[k] === 'true';
  }
  const schema = only ? CompanySchema.pick(Object.fromEntries(only.map((k) => [k, true])) as Partial<Record<CompanyField, true>>) : CompanySchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const data = parsed.data as Partial<z.infer<typeof CompanySchema>>;
  const company = await getCompany();

  let logoUrl: string | null | undefined;
  const logoFile = formData.get('logo');
  const removeLogo = formData.get('removeLogo') === 'true';
  if (logoFile instanceof File && logoFile.size > 0) {
    try {
      logoUrl = await saveUploadedImage(logoFile, 'company');
    } catch (e: any) {
      return { error: e.message ?? 'Could not upload logo.' };
    }
    if (company.logoUrl) await deleteUploadedImage(company.logoUrl);
  } else if (removeLogo && company.logoUrl) {
    await deleteUploadedImage(company.logoUrl);
    logoUrl = null;
  }

  let signatureUrl: string | null | undefined;
  const signatureFile = formData.get('signature');
  const removeSignature = formData.get('removeSignature') === 'true';
  if (signatureFile instanceof File && signatureFile.size > 0) {
    try {
      signatureUrl = await saveUploadedImage(signatureFile, 'signature');
    } catch (e: any) {
      return { error: e.message ?? 'Could not upload signature.' };
    }
    if (company.signatureUrl) await deleteUploadedImage(company.signatureUrl);
  } else if (removeSignature && company.signatureUrl) {
    await deleteUploadedImage(company.signatureUrl);
    signatureUrl = null;
  }

  // NIC password / client secret: a blank submission means "keep the
  // existing encrypted value" — the form never round-trips the decrypted
  // secret back to the client, so there's nothing to re-submit unless the
  // user is actually changing it.
  const nicPassword = formData.get('nicPassword');
  const nicClientSecret = formData.get('nicClientSecret');
  const secretUpdates: { nicPasswordEnc?: string; nicClientSecretEnc?: string } = {};
  if (typeof nicPassword === 'string' && nicPassword.trim()) secretUpdates.nicPasswordEnc = encryptSecret(nicPassword.trim());
  if (typeof nicClientSecret === 'string' && nicClientSecret.trim()) secretUpdates.nicClientSecretEnc = encryptSecret(nicClientSecret.trim());

  await prisma.company.update({
    where: { id: company.id },
    data: { ...data, ...(logoUrl !== undefined ? { logoUrl } : {}), ...(signatureUrl !== undefined ? { signatureUrl } : {}), ...secretUpdates },
  });
  // The company's state decides IGST vs CGST+SGST on every invoice (compared
  // against each customer's state), so moving it re-derives every invoice's
  // stored totals — exactly as the live computeTotals() on the invoice page
  // will.
  if (data.state && data.state !== company.state) {
    await recomputeStoredTotals({}, data.state);
  }
  revalidatePath('/company');
  revalidatePath('/'); // GST rate changes affect every page that computes totals
  return {};
}

const GstDefaultsSchema = z.object({
  cgstRate: z.number().min(0).max(100),
  sgstRate: z.number().min(0).max(100),
  igstRate: z.number().min(0).max(100),
  cgstEnabled: z.boolean(),
  sgstEnabled: z.boolean(),
  igstEnabled: z.boolean(),
  pdfShowBankDetails: z.boolean(),
  pdfShowHsnSummary: z.boolean(),
  showUpiQr: z.boolean(),
  showGpayNumber: z.boolean(),
});

/**
 * A narrow, plain-object counterpart to updateCompany() for one caller: the
 * invoice builder's per-invoice Settings sheet, which lets a business "Save
 * as company default" whatever override it just applied to one invoice.
 * Deliberately touches only these 10 fields via a partial Prisma update —
 * NOT a thin wrapper around updateCompany()'s FormData/CompanySchema path,
 * because that schema recomputes several other booleans (nicSandbox, etc.)
 * from whatever raw FormData keys happen to be present, silently coercing
 * any omitted one to false. Building a "complete enough" FormData from the
 * builder's own (much narrower) client-side Company type would risk
 * clobbering compliance settings the builder never even loads.
 */
export async function updateCompanyGstDefaults(input: z.infer<typeof GstDefaultsSchema>): Promise<{ error?: string }> {
  const parsed = GstDefaultsSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid settings' };
  const company = await getCompany();
  await prisma.company.update({ where: { id: company.id }, data: parsed.data });
  revalidatePath('/company');
  revalidatePath('/invoices/new');
  revalidatePath('/');
  return {};
}
