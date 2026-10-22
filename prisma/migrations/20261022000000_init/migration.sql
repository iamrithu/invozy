-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "InvoiceTemplate" AS ENUM ('MODERN', 'CLASSIC');

-- CreateEnum
CREATE TYPE "EinvoiceStatus" AS ENUM ('NOT_GENERATED', 'GENERATED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "EwaybillStatus" AS ENUM ('NOT_GENERATED', 'GENERATED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('ROAD', 'RAIL', 'AIR', 'SHIP');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "address" TEXT,
    "state" TEXT NOT NULL,
    "district" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "email" TEXT,
    "bankName" TEXT,
    "bankAcc" TEXT,
    "ifsc" TEXT,
    "branch" TEXT,
    "upi" TEXT,
    "showUpiQr" BOOLEAN NOT NULL DEFAULT false,
    "showGpayNumber" BOOLEAN NOT NULL DEFAULT false,
    "cgstRate" DECIMAL(65,30) NOT NULL DEFAULT 9,
    "sgstRate" DECIMAL(65,30) NOT NULL DEFAULT 9,
    "igstRate" DECIMAL(65,30) NOT NULL DEFAULT 18,
    "cgstEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sgstEnabled" BOOLEAN NOT NULL DEFAULT true,
    "igstEnabled" BOOLEAN NOT NULL DEFAULT true,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "invoiceFY" TEXT NOT NULL,
    "nextInvoiceNo" INTEGER NOT NULL DEFAULT 1,
    "terms" TEXT,
    "logoUrl" TEXT,
    "themeColor" TEXT NOT NULL DEFAULT 'red',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pdfShowBankDetails" BOOLEAN NOT NULL DEFAULT true,
    "pdfShowHsnSummary" BOOLEAN NOT NULL DEFAULT false,
    "defaultHsn" TEXT NOT NULL DEFAULT '21050000',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fssaiNo" TEXT,
    "pincode" TEXT,
    "invoiceTemplate" "InvoiceTemplate" NOT NULL DEFAULT 'MODERN',
    "signatoryName" TEXT,
    "signatureUrl" TEXT,
    "nicSandbox" BOOLEAN NOT NULL DEFAULT true,
    "nicUsername" TEXT,
    "nicPasswordEnc" TEXT,
    "nicClientId" TEXT,
    "nicClientSecretEnc" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboardedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "identifier" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("identifier")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "packQty" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "desc" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hsn" TEXT,
    "altUnit" TEXT,
    "altQtyPerUnit" DECIMAL(65,30),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPriceTier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "approxQty" DECIMAL(65,30),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductPriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopName" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "email" TEXT,
    "state" TEXT NOT NULL,
    "district" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "terms" TEXT NOT NULL DEFAULT 'Due on receipt',
    "creditLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "guest" BOOLEAN NOT NULL DEFAULT false,
    "fssaiNo" TEXT,
    "pincode" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "overallDiscountType" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "overallDiscountValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "deliveryInstructions" TEXT,
    "showTransportDetails" BOOLEAN NOT NULL DEFAULT false,
    "transportVehicleNo" TEXT,
    "transportDriverName" TEXT,
    "transportDriverPhone" TEXT,
    "cgstRate" DECIMAL(65,30) NOT NULL DEFAULT 9,
    "sgstRate" DECIMAL(65,30) NOT NULL DEFAULT 9,
    "igstRate" DECIMAL(65,30) NOT NULL DEFAULT 18,
    "cgstEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sgstEnabled" BOOLEAN NOT NULL DEFAULT true,
    "igstEnabled" BOOLEAN NOT NULL DEFAULT true,
    "showBankDetails" BOOLEAN NOT NULL DEFAULT true,
    "showHsnSummary" BOOLEAN NOT NULL DEFAULT false,
    "showUpiQr" BOOLEAN NOT NULL DEFAULT false,
    "showGpayNumber" BOOLEAN NOT NULL DEFAULT false,
    "taxable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interState" BOOLEAN NOT NULL DEFAULT false,
    "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "irn" TEXT,
    "ackNo" TEXT,
    "ackDate" TIMESTAMP(3),
    "signedQrCode" TEXT,
    "einvoiceStatus" "EinvoiceStatus" NOT NULL DEFAULT 'NOT_GENERATED',
    "einvoiceError" TEXT,
    "vehicleNo" TEXT,
    "transporterId" TEXT,
    "transporterName" TEXT,
    "transporterDocNo" TEXT,
    "transporterDocDate" TIMESTAMP(3),
    "transportMode" "TransportMode" NOT NULL DEFAULT 'ROAD',
    "distanceKm" INTEGER,
    "ewbNo" TEXT,
    "ewbDate" TIMESTAMP(3),
    "ewbValidUpto" TIMESTAMP(3),
    "ewaybillStatus" "EwaybillStatus" NOT NULL DEFAULT 'NOT_GENERATED',
    "ewbError" TEXT,
    "deliveryNote" TEXT,
    "deliveryNoteDate" TIMESTAMP(3),
    "buyersOrderNo" TEXT,
    "buyersOrderDate" TIMESTAMP(3),
    "dispatchDocNo" TEXT,
    "otherReferences" TEXT,
    "billOfLadingNo" TEXT,
    "destination" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hsn" TEXT,
    "batch" TEXT,
    "altUnit" TEXT,
    "altQtyPerUnit" DECIMAL(65,30),

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mode" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Product_category_name_idx" ON "Product"("category", "name");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE INDEX "ProductPriceTier_productId_idx" ON "ProductPriceTier"("productId");

-- CreateIndex
CREATE INDEX "Customer_guest_name_idx" ON "Customer"("guest", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_date_idx" ON "Invoice"("date");

-- CreateIndex
CREATE INDEX "Invoice_status_due_idx" ON "Invoice"("status", "due");

-- CreateIndex
CREATE INDEX "Invoice_customerId_date_idx" ON "Invoice"("customerId", "date");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_date_idx" ON "Payment"("date");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceTier" ADD CONSTRAINT "ProductPriceTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

