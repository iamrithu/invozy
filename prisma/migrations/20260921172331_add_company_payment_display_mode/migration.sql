-- AlterTable: replace the boolean "show a QR, yes/no" toggle with a 3-way
-- mode, since a company can now choose a scannable UPI QR, a plain GPay
-- number, or neither.
ALTER TABLE "Company" ADD COLUMN "paymentDisplayMode" TEXT NOT NULL DEFAULT 'none';

-- Backfill: carry forward whatever was already switched on before dropping it.
UPDATE "Company" SET "paymentDisplayMode" = 'qr' WHERE "showUpiQr" = true;

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "showUpiQr";
