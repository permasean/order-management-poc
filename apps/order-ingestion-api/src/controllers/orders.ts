import type { Request, Response } from "express";
import { Connection, Client } from "@temporalio/client";
import { prisma, DispatchType, OrderStatus } from "@repo/database";
import { WORKFLOW_CONFIG } from "@repo/config";
import { createOrderSchema } from "../validation/orderSchema.js";

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";

let client: Client;

async function getClient() {
	if (!client) {
		const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
		client = new Client({ connection });
	}
	return client;
}

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

	const temporal = await getClient();
	await temporal.workflow.start("orderLifecycle", {
		taskQueue: WORKFLOW_CONFIG.lifecycle.taskQueue,
		workflowId: WORKFLOW_CONFIG.lifecycle.workflowId(order.id),
		args: [{ orderId: order.id }],
	});

	res.status(201).json({ orderId: order.id });
}
