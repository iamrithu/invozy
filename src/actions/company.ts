'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { saveUploadedImage, deleteUploadedImage } from '@/lib/uploads';
import { isValidThemeColor } from '@/lib/theme-presets';
import { encryptSecret } from '@/lib/secret';

const CompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional().nullable(),
  // Optional to match the nullable DB columns — a brand-new signup hasn't
  // filled these in yet, and each Company settings save submits every tab's
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
  invoiceTemplate: z.enum(['MODERN', 'CLASSIC']).optional(),
  fssaiNo: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  // Per-company currency + PDF-handling toggles — plain fields, no
  // encryption needed (not secrets), same path as invoiceTemplate/cgstEnabled.
  currency: z.string().min(1).optional(),
  pdfShowBankDetails: z.coerce.boolean().optional(),
  pdfShowHsnSummary: z.coerce.boolean().optional(),
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

export async function getCompanyProfile() {
  return getCompany();
}

export async function updateCompany(_prev: CompanyFormState, formData: FormData): Promise<CompanyFormState> {
  const raw = Object.fromEntries(formData);
  const parsed = CompanySchema.safeParse({
    ...raw,
    cgstEnabled: raw.cgstEnabled === 'on' || raw.cgstEnabled === 'true',
    sgstEnabled: raw.sgstEnabled === 'on' || raw.sgstEnabled === 'true',
    igstEnabled: raw.igstEnabled === 'on' || raw.igstEnabled === 'true',
    nicSandbox: raw.nicSandbox === 'on' || raw.nicSandbox === 'true',
    pdfShowBankDetails: raw.pdfShowBankDetails === 'on' || raw.pdfShowBankDetails === 'true',
    pdfShowHsnSummary: raw.pdfShowHsnSummary === 'on' || raw.pdfShowHsnSummary === 'true',
  });
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const company = await getCompany();

  let logoUrl: string | null | undefined;
  const logoFile = formData.get('logo');
  const removeLogo = formData.get('removeLogo') === 'true';
  if (logoFile instanceof File && logoFile.size > 0) {
    try {
      logoUrl = await saveUploadedImage(logoFile, company.id, 'company');
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
      signatureUrl = await saveUploadedImage(signatureFile, company.id, 'signature');
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
    data: { ...parsed.data, ...(logoUrl !== undefined ? { logoUrl } : {}), ...(signatureUrl !== undefined ? { signatureUrl } : {}), ...secretUpdates },
  });
  revalidatePath('/company');
  revalidatePath('/'); // GST rate changes affect every page that computes totals
  return {};
}
