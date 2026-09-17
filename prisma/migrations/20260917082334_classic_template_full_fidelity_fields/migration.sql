-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billOfLadingNo" TEXT,
ADD COLUMN     "buyersOrderDate" TIMESTAMP(3),
ADD COLUMN     "buyersOrderNo" TEXT,
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "deliveryNoteDate" TIMESTAMP(3),
ADD COLUMN     "destination" TEXT,
ADD COLUMN     "dispatchDocNo" TEXT,
ADD COLUMN     "otherReferences" TEXT,
ADD COLUMN     "transporterDocDate" TIMESTAMP(3),
ADD COLUMN     "transporterDocNo" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "altQtyPerUnit" DECIMAL(65,30),
ADD COLUMN     "altUnit" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "altQtyPerUnit" DECIMAL(65,30),
ADD COLUMN     "altUnit" TEXT;
