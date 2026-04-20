/*
  Warnings:

  - You are about to drop the `outbox_events` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "techFirstName" TEXT,
ADD COLUMN     "techLastName" TEXT,
ADD COLUMN     "techMobilePhone" TEXT,
ADD COLUMN     "vendorOrderNumber" TEXT;

-- DropTable
DROP TABLE "outbox_events";
