-- AlterTable: per-company fallback HSN/SAC code, replacing the app-wide
-- hardcoded '21050000' default with something each business can set for
-- itself (a product's own HSN, or a line's own override, still wins).
ALTER TABLE "Company" ADD COLUMN "defaultHsn" TEXT NOT NULL DEFAULT '21050000';
