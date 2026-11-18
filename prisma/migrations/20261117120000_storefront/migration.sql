-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "storeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "storeSettings" JSONB,
ADD COLUMN     "storeSlug" TEXT;

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "name" TEXT NOT NULL,
    "pincodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "charge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "freeAbove" DECIMAL(65,30),
    "minOrder" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryZone_companyId_active_idx" ON "DeliveryZone"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Company_storeSlug_key" ON "Company"("storeSlug");

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

