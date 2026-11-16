/*
  Warnings:

  - You are about to drop the column `contactPerson` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `contactPhone` on the `Customer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "contactPerson",
DROP COLUMN "contactPhone";
