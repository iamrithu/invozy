-- AlterTable: informal per-invoice transport/delivery reference details,
-- separate from the e-Way Bill compliance columns already on this table.
ALTER TABLE "Invoice" ADD COLUMN "showTransportDetails" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN "transportVehicleNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "transportDriverName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "transportDriverPhone" TEXT;
