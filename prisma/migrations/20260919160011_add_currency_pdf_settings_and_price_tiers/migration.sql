-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "pdfShowBankDetails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pdfShowHsnSummary" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProductPriceTier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "minQty" DECIMAL(65,30),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductPriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPriceTier_productId_idx" ON "ProductPriceTier"("productId");

-- AddForeignKey
ALTER TABLE "ProductPriceTier" ADD CONSTRAINT "ProductPriceTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: give every existing product exactly one price tier
-- mirroring its current unit/price (and packQty as a minimum quantity,
-- when set), so no pre-existing product ends up with zero pricing tiers
-- once the app starts reading from ProductPriceTier.
INSERT INTO "ProductPriceTier" ("id", "productId", "unit", "price", "minQty", "sortOrder")
SELECT
  'cptr_' || substr(md5(random()::text || clock_timestamp()::text || p."id"), 1, 20),
  p."id",
  p."unit",
  p."price",
  CASE WHEN p."packQty" IS NOT NULL AND p."packQty" > 0 THEN p."packQty"::decimal ELSE NULL END,
  0
FROM "Product" p;
