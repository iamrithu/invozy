-- DropIndex
DROP INDEX "Payment_creditNoteId_key";

-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "deduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "deductionReason" TEXT;

-- AlterTable
ALTER TABLE "CreditNoteItem" ADD COLUMN     "creditPct" DECIMAL(65,30) NOT NULL DEFAULT 100,
ADD COLUMN     "restock" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mode" TEXT,
    "reference" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_creditNoteId_idx" ON "Refund"("creditNoteId");

-- CreateIndex
CREATE INDEX "Refund_date_idx" ON "Refund"("date");

-- CreateIndex
CREATE INDEX "Payment_creditNoteId_idx" ON "Payment"("creditNoteId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing credit notes restocked all of their lines or none of them.
UPDATE "CreditNoteItem" i SET "restock" = c."restock" FROM "CreditNote" c WHERE c."id" = i."creditNoteId";
