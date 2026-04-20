import type { Request, Response } from "express";
import { prisma, DispatchType, OrderStatus } from "@repo/database";
import { WORKFLOW_CONFIG } from "@repo/config";
import { tasks } from "@trigger.dev/sdk/v3";
import { createOrderSchema } from "../validation/orderSchema.js";

const DISPATCH_TYPE_MAP: Record<string, DispatchType> = {
  "New Install": DispatchType.NEW_INSTALL,
  Repair: DispatchType.REPAIR,
  "Site Survey": DispatchType.SITE_SURVEY,
};

export async function createOrder(req: Request, res: Response) {
  const result = createOrderSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Validation failed",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const { ticketId, siteAddress, scheduledDateTime, dispatchType } =
    result.data;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        ticketId,
        siteAddress,
        scheduledDateTime: new Date(scheduledDateTime),
        dispatchType: DISPATCH_TYPE_MAP[dispatchType]!,
      },
    });

    await tx.statusHistory.create({
      data: {
        orderId: created.id,
        fromStatus: null,
        toStatus: OrderStatus.PENDING_APPROVAL,
      },
    });

    return created;
  });

  await tasks.trigger("order-lifecycle", { orderId: order.id }, {
    idempotencyKey: WORKFLOW_CONFIG.lifecycle.idempotencyKey(order.id),
    idempotencyKeyTTL: WORKFLOW_CONFIG.lifecycle.idempotencyKeyTTL,
  });

  res.status(201).json({ orderId: order.id });
}
