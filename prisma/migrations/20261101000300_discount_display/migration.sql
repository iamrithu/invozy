-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "pdfShowBillDiscount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pdfShowItemDiscount" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discount" DECIMAL(65,30) NOT NULL DEFAULT 0;

