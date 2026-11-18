-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "parentId" TEXT,
    "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "showOnStore" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_companyId_deletedAt_status_sortOrder_idx" ON "Category"("companyId", "deletedAt", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_slug_key" ON "Category"("companyId", "slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill ───────────────────────────────────────────────────────────────
-- One Category per distinct (company, category text), matched
-- case-insensitively so "Milk" and "milk " become one. Ids are derived from
-- the company and the lowercased name, so the UPDATE below can find them.
-- Slugs that would clash inside a company get a short hash suffix.
WITH names AS (
  SELECT p."companyId", min(trim(p."category")) AS name, lower(trim(p."category")) AS key
  FROM "Product" p
  WHERE trim(coalesce(p."category", '')) <> ''
  GROUP BY p."companyId", lower(trim(p."category"))
), slugged AS (
  SELECT n.*,
         coalesce(nullif(trim(both '-' from regexp_replace(lower(n.name), '[^a-z0-9]+', '-', 'g')), ''), 'category') AS base,
         row_number() OVER (PARTITION BY n."companyId" ORDER BY n.key) AS pos
  FROM names n
), deduped AS (
  SELECT s.*, row_number() OVER (PARTITION BY s."companyId", s.base ORDER BY s.key) AS dup
  FROM slugged s
)
INSERT INTO "Category" ("id", "companyId", "name", "slug", "sortOrder", "createdAt", "updatedAt")
SELECT 'cat_' || md5(d."companyId" || ':' || d.key),
       d."companyId",
       d.name,
       CASE WHEN d.dup = 1 THEN d.base ELSE d.base || '-' || substr(md5(d.key), 1, 6) END,
       d.pos::int,
       now(),
       now()
FROM deduped d;

-- Link every product to its category and use the category's spelling.
UPDATE "Product" p
SET "categoryId" = 'cat_' || md5(p."companyId" || ':' || lower(trim(p."category")))
WHERE trim(coalesce(p."category", '')) <> '';

UPDATE "Product" p
SET "category" = c."name"
FROM "Category" c
WHERE c."id" = p."categoryId" AND p."category" <> c."name";
