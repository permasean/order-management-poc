import type { Request, Response } from "express";
import { Connection, Client } from "@temporalio/client";
import { prisma, OrderStatus } from "@repo/database";
import { WORKFLOW_CONFIG } from "@repo/config";
import { reviewSchema } from "../validation/reviewSchema.js";
import { AppError } from "../middleware/errorHandler.js";

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";

let client: Client;

async function getClient() {
	if (!client) {
		const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
		client = new Client({ connection });
	}
	return client;
}

export async function submitReviewDecision(req: Request, res: Response) {
	const id = req.params.id as string;

	const result = reviewSchema.safeParse(req.body);
	if (!result.success) {
		throw new AppError(400, result.error.errors.map((e) => e.message).join(", "));
	}

	const order = await prisma.order.findUnique({ where: { id } });
	if (!order) {
		throw new AppError(404, "Order not found");
	}

	if (order.status !== OrderStatus.MANUAL_REVIEW) {
		throw new AppError(409, "Order is not in manual review");
	}

	try {
		const temporal = await getClient();
		const handle = temporal.workflow.getHandle(WORKFLOW_CONFIG.lifecycle.workflowId(id));
		await handle.signal("manual-review", result.data);
	} catch (error) {
		const errorStr = String(error);
		if (errorStr.includes("not found") || errorStr.includes("NOT_FOUND")) {
			throw new AppError(409, "Review decision already submitted");
		}
		console.error("Failed to signal workflow:", error);
		throw new AppError(500, "Failed to submit review decision");
	}

	res.json({ message: "Review decision submitted", orderId: id, action: result.data.action });
}
