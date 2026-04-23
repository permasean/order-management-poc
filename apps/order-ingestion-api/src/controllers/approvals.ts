import type { Request, Response } from "express";
import { Connection, Client } from "@temporalio/client";
import { prisma, OrderStatus } from "@repo/database";
import { WORKFLOW_CONFIG } from "@repo/config";
import { approvalSchema } from "../validation/approvalSchema.js";

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";

let client: Client;

async function getClient() {
	if (!client) {
		const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
		client = new Client({ connection });
	}
	return client;
}

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

	const temporal = await getClient();
	const handle = temporal.workflow.getHandle(WORKFLOW_CONFIG.lifecycle.workflowId(orderId));
	await handle.signal("approval", { vendorName });

	res.status(200).json({ orderId: order.id, status: "REQUEST_SENT" });
}
