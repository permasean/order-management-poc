-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "closeoutNotes" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
