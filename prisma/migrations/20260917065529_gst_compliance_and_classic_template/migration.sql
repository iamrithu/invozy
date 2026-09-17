-- CreateEnum
CREATE TYPE "InvoiceTemplate" AS ENUM ('MODERN', 'CLASSIC');

-- CreateEnum
CREATE TYPE "EinvoiceStatus" AS ENUM ('NOT_GENERATED', 'GENERATED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "EwaybillStatus" AS ENUM ('NOT_GENERATED', 'GENERATED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('ROAD', 'RAIL', 'AIR', 'SHIP');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "fssaiNo" TEXT,
ADD COLUMN     "invoiceTemplate" "InvoiceTemplate" NOT NULL DEFAULT 'MODERN',
ADD COLUMN     "nicClientId" TEXT,
ADD COLUMN     "nicClientSecretEnc" TEXT,
ADD COLUMN     "nicPasswordEnc" TEXT,
ADD COLUMN     "nicSandbox" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nicUsername" TEXT,
ADD COLUMN     "pincode" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "fssaiNo" TEXT,
ADD COLUMN     "pincode" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "ackDate" TIMESTAMP(3),
ADD COLUMN     "ackNo" TEXT,
ADD COLUMN     "distanceKm" INTEGER,
ADD COLUMN     "einvoiceError" TEXT,
ADD COLUMN     "einvoiceStatus" "EinvoiceStatus" NOT NULL DEFAULT 'NOT_GENERATED',
ADD COLUMN     "ewaybillStatus" "EwaybillStatus" NOT NULL DEFAULT 'NOT_GENERATED',
ADD COLUMN     "ewbDate" TIMESTAMP(3),
ADD COLUMN     "ewbError" TEXT,
ADD COLUMN     "ewbNo" TEXT,
ADD COLUMN     "ewbValidUpto" TIMESTAMP(3),
ADD COLUMN     "irn" TEXT,
ADD COLUMN     "signedQrCode" TEXT,
ADD COLUMN     "transportMode" "TransportMode" NOT NULL DEFAULT 'ROAD',
ADD COLUMN     "transporterId" TEXT,
ADD COLUMN     "transporterName" TEXT,
ADD COLUMN     "vehicleNo" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "batch" TEXT,
ADD COLUMN     "hsn" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hsn" TEXT;
