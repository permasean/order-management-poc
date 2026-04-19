import type { Request, Response } from "express";
import { prisma, OrderStatus } from "@repo/database";
import { approvalSchema } from "../validation/approvalSchema.js";

export async function approveOrder(req: Request, res: Response) {
  const result = approvalSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Validation failed",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const { orderId, vendorName } = result.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status === OrderStatus.REQUEST_SENT && order.vendorName === vendorName) {
    res.status(200).json({ orderId: order.id, status: order.status });
    return;
  }

  if (order.status !== OrderStatus.PENDING_APPROVAL) {
    res.status(409).json({ error: "Order is not in Pending Approval status" });
    return;
  }

  const [updated] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.REQUEST_SENT,
        vendorName,
      },
    }),
    prisma.outboxEvent.create({
      data: {
        eventType: "order.approved",
        payload: { orderId },
      },
    }),
  ]);

  res.status(200).json({ orderId: updated.id, status: updated.status });
}
