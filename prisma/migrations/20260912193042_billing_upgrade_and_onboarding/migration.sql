-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_productId_fkey";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "district" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "district" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
