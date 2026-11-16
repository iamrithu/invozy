import { rootPrisma } from './prisma';
import { deleteCompanyUploads } from './uploads';
import { deleteCompanyBackups } from './backup';
import { deleteStoredPdfs } from './invoice-pdf';
import { lockoutKey } from './login-rate-limit';

// Permanent deletion of a company and everything it owns — the platform
// admin's answer to an owner's deletion request (DPDP: right to erasure).
// Rows go in foreign-key order inside one transaction, so it either all goes
// or nothing does; files (uploads, stored PDFs, backups) are removed after.
// The platform audit log keeps a record that it happened.

export async function purgeCompany(companyId: string): Promise<Record<string, number>> {
  const company = await rootPrisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new Error('That company no longer exists.');

  const [pdfs, logins] = await Promise.all([
    rootPrisma.invoice.findMany({ where: { companyId, pdfUrl: { not: null } }, select: { pdfUrl: true } }),
    rootPrisma.user.findMany({ where: { companyId }, select: { email: true, phone: true } }),
  ]);

  const byUser = { user: { companyId } };
  const steps = [
    ['NotificationRead', rootPrisma.notificationRead.deleteMany({ where: byUser })],
    ['EmailVerificationToken', rootPrisma.emailVerificationToken.deleteMany({ where: byUser })],
    ['PasswordResetToken', rootPrisma.passwordResetToken.deleteMany({ where: byUser })],
    ['ActivityLog', rootPrisma.activityLog.deleteMany({ where: { companyId } })],
    ['AppSetting', rootPrisma.appSetting.deleteMany({ where: { companyId } })],
    ['SubscriptionPayment', rootPrisma.subscriptionPayment.deleteMany({ where: { companyId } })],
    ['Refund', rootPrisma.refund.deleteMany({ where: { companyId } })],
    ['Payment', rootPrisma.payment.deleteMany({ where: { companyId } })],
    ['StockMovement', rootPrisma.stockMovement.deleteMany({ where: { companyId } })],
    ['CreditNoteItem', rootPrisma.creditNoteItem.deleteMany({ where: { creditNote: { companyId } } })],
    ['CreditNote', rootPrisma.creditNote.deleteMany({ where: { companyId } })],
    ['PurchaseAttachment', rootPrisma.purchaseAttachment.deleteMany({ where: { purchase: { companyId } } })],
    ['PurchaseItem', rootPrisma.purchaseItem.deleteMany({ where: { purchase: { companyId } } })],
    ['Purchase', rootPrisma.purchase.deleteMany({ where: { companyId } })],
    ['Supplier', rootPrisma.supplier.deleteMany({ where: { companyId } })],
    ['InvoiceItem', rootPrisma.invoiceItem.deleteMany({ where: { invoice: { companyId } } })],
    ['Invoice', rootPrisma.invoice.deleteMany({ where: { companyId } })],
    ['CustomerPrice', rootPrisma.customerPrice.deleteMany({ where: { customer: { companyId } } })],
    ['Scheme', rootPrisma.scheme.deleteMany({ where: { product: { companyId } } })],
    ['ProductPriceTier', rootPrisma.productPriceTier.deleteMany({ where: { product: { companyId } } })],
    ['Product', rootPrisma.product.deleteMany({ where: { companyId } })],
    ['Customer', rootPrisma.customer.deleteMany({ where: { companyId } })],
    ['User', rootPrisma.user.deleteMany({ where: { companyId } })],
    ['Company', rootPrisma.company.deleteMany({ where: { id: companyId } })],
  ] as const;
  const results = await rootPrisma.$transaction(steps.map(([, op]) => op));
  const counts = Object.fromEntries(steps.map(([name], i) => [name, results[i].count]));

  // Files and security state, after the rows are gone (never failing the delete).
  const keys = logins.flatMap((u) => [u.email, u.phone]).filter((v): v is string => !!v).map((v) => lockoutKey(v));
  if (keys.length) await rootPrisma.loginAttempt.deleteMany({ where: { identifier: { in: keys } } }).catch(() => {});
  await deleteStoredPdfs(pdfs.map((p) => p.pdfUrl!));
  counts.files = await deleteCompanyUploads(companyId);
  await deleteCompanyBackups(companyId);
  return counts;
}
