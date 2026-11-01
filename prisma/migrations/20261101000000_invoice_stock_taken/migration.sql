-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "stockTaken" BOOLEAN NOT NULL DEFAULT true;

-- Drafts used to take no stock until they were sent; from now on every save
-- takes it. Existing drafts haven't taken theirs yet — they take it the next
-- time they're saved, sent or paid.
UPDATE "Invoice" SET "stockTaken" = false WHERE "status" = 'DRAFT';
