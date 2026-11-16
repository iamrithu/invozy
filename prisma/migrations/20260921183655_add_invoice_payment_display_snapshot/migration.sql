-- AlterTable: snapshot the UPI QR / GPay number display choice onto each
-- invoice, same as the existing GST/section-visibility snapshot fields, so
-- a later change to Company.showUpiQr/showGpayNumber doesn't retroactively
-- change how an already-issued invoice prints.
ALTER TABLE "Invoice" ADD COLUMN "showUpiQr" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN "showGpayNumber" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing rows from the company's current values — best-effort,
-- same caveat as the original GST snapshot backfill: this is only accurate
-- for invoices whose company setting hasn't changed since they were created.
UPDATE "Invoice" i
SET "showUpiQr" = c."showUpiQr",
    "showGpayNumber" = c."showGpayNumber"
FROM "Company" c
WHERE c.id = i."companyId";
