-- Brings the ASB feature set (inventory, purchases & suppliers, returns /
-- credit notes / refunds, customer prices & schemes, receipts, activity log,
-- notifications, per-company settings, stored invoice totals) into the
-- multi-tenant schema, plus the platform-admin company switches.
--
-- Additive for existing tenants: no column or row is dropped, and every new
-- column on an existing table is either defaulted or backfilled below.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'ADJUSTMENT', 'DAMAGE');

-- AlterEnum
ALTER TYPE "InvoiceTemplate" ADD VALUE 'CLEAN';

-- DropIndex
DROP INDEX "Product_companyId_category_idx";

-- DropIndex
DROP INDEX "Customer_companyId_guest_idx";

-- DropIndex
DROP INDEX "Invoice_companyId_status_idx";

-- DropIndex
DROP INDEX "Invoice_customerId_idx";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "creditNotePrefix" TEXT NOT NULL DEFAULT 'CN',
ADD COLUMN     "disabledModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "expiryAlertDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "nextCreditNoteNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextReceiptNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pdfShowBillDiscount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pdfShowItemDiscount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "receiptPrefix" TEXT NOT NULL DEFAULT 'RCPT',
ADD COLUMN     "reorderLeadDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "tallyLedgers" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT,
ALTER COLUMN "companyId" SET DEFAULT current_setting('app.company_id'::text);

-- Role(OWNER, SUPER_ADMIN) -> UserRole(OWNER, STAFF), keeping every login's
-- role (Prisma's generated SQL dropped and re-added the column). The platform
-- super-admin lives in env vars and was never a User row, so no row holds
-- SUPER_ADMIN; if one somehow does, this cast fails and nothing is guessed.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OWNER';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "lowStockAt" DECIMAL(65,30),
ADD COLUMN     "stockQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "companyId" SET DEFAULT current_setting('app.company_id'::text);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "route" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "companyId" SET DEFAULT current_setting('app.company_id'::text);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "interState" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastRemindedAt" TIMESTAMP(3),
ADD COLUMN     "pdfKey" TEXT,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "stockTaken" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taxable" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
ALTER COLUMN "companyId" SET DEFAULT current_setting('app.company_id'::text);

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "stockQty" DECIMAL(65,30);

-- AlterTable
-- companyId is added nullable, filled from each payment's invoice, then
-- tightened — a NOT NULL column with this default can't be added to a table
-- that already has rows (the default would be evaluated for them).
ALTER TABLE "Payment" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creditNoteId" TEXT,
ADD COLUMN     "receiptNo" TEXT,
ADD COLUMN     "reference" TEXT;

UPDATE "Payment" p SET "companyId" = i."companyId", "createdAt" = p."date"
FROM "Invoice" i WHERE i."id" = p."invoiceId";

ALTER TABLE "Payment" ALTER COLUMN "companyId" SET NOT NULL,
ALTER COLUMN "companyId" SET DEFAULT current_setting('app.company_id'::text);

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "CustomerPrice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "CustomerPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scheme" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT,
    "unit" TEXT NOT NULL,
    "buyQty" DECIMAL(65,30) NOT NULL,
    "freeQty" DECIMAL(65,30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "invoiceId" TEXT,
    "invoiceNumber" TEXT,
    "purchaseId" TEXT,
    "creditNoteId" TEXT,
    "reference" TEXT,
    "unitCost" DECIMAL(65,30),
    "note" TEXT,
    "batchNo" TEXT,
    "expiryDate" TIMESTAMP(3),
    "userId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "state" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "supplierId" TEXT NOT NULL,
    "billNo" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "taxable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseAttachment" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "gstRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "stockQty" DECIMAL(65,30),
    "batchNo" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    "invoiceNumber" TEXT,
    "customerId" TEXT NOT NULL,
    "reason" TEXT,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "cgstRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgstRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igstRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interState" BOOLEAN NOT NULL DEFAULT false,
    "taxable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "refundDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteItem" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "hsn" TEXT,
    "qty" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "stockQty" DECIMAL(65,30),
    "creditPct" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "restock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "creditNoteId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mode" TEXT,
    "reference" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("userId","notificationId")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("companyId","key")
);

-- CreateIndex
CREATE INDEX "CustomerPrice_productId_idx" ON "CustomerPrice"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPrice_customerId_productId_unit_key" ON "CustomerPrice"("customerId", "productId", "unit");

-- CreateIndex
CREATE INDEX "Scheme_productId_idx" ON "Scheme"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_date_idx" ON "StockMovement"("productId", "date");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_date_idx" ON "StockMovement"("companyId", "date");

-- CreateIndex
CREATE INDEX "StockMovement_invoiceId_idx" ON "StockMovement"("invoiceId");

-- CreateIndex
CREATE INDEX "StockMovement_purchaseId_idx" ON "StockMovement"("purchaseId");

-- CreateIndex
CREATE INDEX "StockMovement_creditNoteId_idx" ON "StockMovement"("creditNoteId");

-- CreateIndex
CREATE INDEX "Supplier_companyId_active_name_idx" ON "Supplier"("companyId", "active", "name");

-- CreateIndex
CREATE INDEX "Purchase_companyId_date_idx" ON "Purchase"("companyId", "date");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_date_idx" ON "Purchase"("supplierId", "date");

-- CreateIndex
CREATE INDEX "PurchaseAttachment_purchaseId_idx" ON "PurchaseAttachment"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

-- CreateIndex
CREATE INDEX "CreditNote_customerId_date_idx" ON "CreditNote"("customerId", "date");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_companyId_date_idx" ON "CreditNote"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_companyId_number_key" ON "CreditNote"("companyId", "number");

-- CreateIndex
CREATE INDEX "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId");

-- CreateIndex
CREATE INDEX "CreditNoteItem_productId_idx" ON "CreditNoteItem"("productId");

-- CreateIndex
CREATE INDEX "Refund_creditNoteId_idx" ON "Refund"("creditNoteId");

-- CreateIndex
CREATE INDEX "Refund_companyId_date_idx" ON "Refund"("companyId", "date");

-- CreateIndex
CREATE INDEX "ActivityLog_companyId_entityType_entityId_idx" ON "ActivityLog"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_companyId_createdAt_idx" ON "ActivityLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_companyId_category_name_idx" ON "Product"("companyId", "category", "name");

-- CreateIndex
CREATE INDEX "Product_companyId_active_idx" ON "Product"("companyId", "active");

-- CreateIndex
CREATE INDEX "Customer_companyId_guest_name_idx" ON "Customer"("companyId", "guest", "name");

-- CreateIndex
CREATE INDEX "Customer_companyId_active_name_idx" ON "Customer"("companyId", "active", "name");

-- CreateIndex
CREATE INDEX "Invoice_companyId_date_idx" ON "Invoice"("companyId", "date");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_due_idx" ON "Invoice"("companyId", "status", "due");

-- CreateIndex
CREATE INDEX "Invoice_customerId_date_idx" ON "Invoice"("customerId", "date");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_companyId_date_idx" ON "Payment"("companyId", "date");

-- CreateIndex
CREATE INDEX "Payment_creditNoteId_idx" ON "Payment"("creditNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_receiptNo_key" ON "Payment"("companyId", "receiptNo");

-- AddForeignKey
ALTER TABLE "CustomerPrice" ADD CONSTRAINT "CustomerPrice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPrice" ADD CONSTRAINT "CustomerPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheme" ADD CONSTRAINT "Scheme_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAttachment" ADD CONSTRAINT "PurchaseAttachment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Backfills for invoices created before this migration ─────────────────

-- Drafts used to take no stock until sent; from now on every save takes it.
-- Existing drafts haven't, so they take it the next time they're saved.
UPDATE "Invoice" SET "stockTaken" = false WHERE "status" = 'DRAFT';

-- amountPaid = Σ payments.
UPDATE "Invoice" i SET "amountPaid" = p."paid"
FROM (SELECT "invoiceId", SUM("amount") AS "paid" FROM "Payment" GROUP BY "invoiceId") p
WHERE p."invoiceId" = i."id";

-- Stored totals = computeTotals() in src/lib/gst.ts, from each invoice's own
-- GST snapshot. Done in float8 — the same IEEE double arithmetic, in the same
-- order, as the JavaScript — so these match what the app itself would store.
-- Math.round(x) is floor(x + 0.5).
WITH "lines" AS (
  SELECT "invoiceId", SUM("qty"::float8 * "rate"::float8 * (1 - COALESCE("discount", 0)::float8 / 100)) AS "subtotal"
  FROM "InvoiceItem" GROUP BY "invoiceId"
), "taxed" AS (
  SELECT i."id",
    GREATEST(
      COALESCE(l."subtotal", 0) - CASE
        WHEN i."overallDiscountType" = 'PERCENT' THEN COALESCE(l."subtotal", 0) * (i."overallDiscountValue"::float8 / 100)
        ELSE LEAST(i."overallDiscountValue"::float8, COALESCE(l."subtotal", 0))
      END, 0) AS "taxable",
    (i."igstEnabled" AND lower(btrim(co."state")) <> lower(btrim(cu."state"))) AS "inter",
    i."cgstRate"::float8 AS "cgstRate", i."sgstRate"::float8 AS "sgstRate", i."igstRate"::float8 AS "igstRate",
    i."cgstEnabled", i."sgstEnabled"
  FROM "Invoice" i
  JOIN "Company" co ON co."id" = i."companyId"
  JOIN "Customer" cu ON cu."id" = i."customerId"
  LEFT JOIN "lines" l ON l."invoiceId" = i."id"
), "split" AS (
  SELECT "id", "taxable", "inter",
    CASE WHEN NOT "inter" AND "cgstEnabled" THEN "taxable" * ("cgstRate" / 100) ELSE 0 END AS "cgst",
    CASE WHEN NOT "inter" AND "sgstEnabled" THEN "taxable" * ("sgstRate" / 100) ELSE 0 END AS "sgst",
    CASE WHEN "inter" THEN "taxable" * ("igstRate" / 100) ELSE 0 END AS "igst"
  FROM "taxed"
)
UPDATE "Invoice" i SET
  "taxable" = s."taxable",
  "interState" = s."inter",
  "cgst" = s."cgst",
  "sgst" = s."sgst",
  "igst" = s."igst",
  "total" = floor(s."taxable" + s."cgst" + s."sgst" + s."igst" + 0.5)
FROM "split" s WHERE s."id" = i."id";
