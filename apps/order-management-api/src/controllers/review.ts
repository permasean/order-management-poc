import type { Request, Response } from "express";
import { prisma, OrderStatus } from "@repo/database";
import { WORKFLOW_CONFIG } from "@repo/config";
import { wait } from "@trigger.dev/sdk/v3";
import { reviewSchema } from "../validation/reviewSchema.js";
import { AppError } from "../middleware/errorHandler.js";

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
		const token = await wait.createToken({
			idempotencyKey: WORKFLOW_CONFIG.manualReview.tokenKey(id, order.manualReviewAttempts),
		});
		await wait.completeToken(token.id, result.data);
	} catch (error) {
		const errorStr = String(error);
		if (errorStr.includes("already completed") || errorStr.includes("already resolved")) {
			throw new AppError(409, "Review decision already submitted");
		}
		console.error("Failed to complete token:", error);
		throw new AppError(500, "Failed to complete review token");
	}

	res.json({ message: "Review decision submitted", orderId: id, action: result.data.action });
}
