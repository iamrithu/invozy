-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "themeColor" TEXT NOT NULL DEFAULT 'red';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
