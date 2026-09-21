-- AlterTable: replace the single "none"/"qr"/"gpay" mode with two
-- independent toggles, so a company can show the QR and the GPay number
-- together, either alone, or neither.
ALTER TABLE "Company" ADD COLUMN "showUpiQr" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "showGpayNumber" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the mode column before dropping it.
UPDATE "Company" SET "showUpiQr" = true WHERE "paymentDisplayMode" = 'qr';
UPDATE "Company" SET "showGpayNumber" = true WHERE "paymentDisplayMode" = 'gpay';

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "paymentDisplayMode";
