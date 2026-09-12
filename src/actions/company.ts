'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { saveUploadedImage, deleteUploadedImage } from '@/lib/uploads';
import { isValidThemeColor } from '@/lib/theme-presets';

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

  await prisma.company.update({
    where: { id: company.id },
    data: { ...parsed.data, ...(logoUrl !== undefined ? { logoUrl } : {}) },
  });
  revalidatePath('/company');
  revalidatePath('/'); // GST rate changes affect every page that computes totals
  return {};
}
