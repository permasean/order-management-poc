-- CreateEnum
CREATE TYPE "DispatchType" AS ENUM ('NEW_INSTALL', 'REPAIR', 'SITE_SURVEY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_APPROVAL', 'REQUEST_SENT', 'CONFIRMED', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "siteAddress" TEXT NOT NULL,
    "scheduledDateTime" TIMESTAMP(3) NOT NULL,
    "dispatchType" "DispatchType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
