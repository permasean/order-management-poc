import type { Request, Response } from "express";
import { prisma, OrderStatus } from "@repo/database";
import { WORKFLOW_CONFIG } from "@repo/config";
import { wait } from "@trigger.dev/sdk/v3";
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

	const token = await wait.createToken({
		idempotencyKey: WORKFLOW_CONFIG.approval.tokenKey(orderId),
	});

	await wait.completeToken(token.id, { vendorName });

	res.status(200).json({ orderId: order.id, status: "REQUEST_SENT" });
}
