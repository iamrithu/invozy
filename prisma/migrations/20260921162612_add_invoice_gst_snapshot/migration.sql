-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "cgstEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cgstRate" DECIMAL(65,30) NOT NULL DEFAULT 9,
ADD COLUMN     "igstEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "igstRate" DECIMAL(65,30) NOT NULL DEFAULT 18,
ADD COLUMN     "sgstEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sgstRate" DECIMAL(65,30) NOT NULL DEFAULT 9,
ADD COLUMN     "showBankDetails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showHsnSummary" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every invoice created before this migration has no snapshot of
-- its own, so seed it from its company's *current* GST settings. This is
-- necessarily best-effort — it's only accurate for an invoice whose
-- company's GST config hasn't changed since that invoice was originally
-- created. The true historical value at each invoice's own creation time
-- was never recorded before this migration, so there is no way to recover
-- it exactly; this is an acknowledged, unfixable gap in pre-migration data,
-- not a bug in this backfill.
UPDATE "Invoice" i
SET
  "cgstRate" = c."cgstRate",
  "sgstRate" = c."sgstRate",
  "igstRate" = c."igstRate",
  "cgstEnabled" = c."cgstEnabled",
  "sgstEnabled" = c."sgstEnabled",
  "igstEnabled" = c."igstEnabled",
  "showBankDetails" = c."pdfShowBankDetails",
  "showHsnSummary" = c."pdfShowHsnSummary"
FROM "Company" c
WHERE c.id = i."companyId";
