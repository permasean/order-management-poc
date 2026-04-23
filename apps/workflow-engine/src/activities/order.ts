import { prisma, OrderStatus, transitionOrder } from "@repo/database";

export async function checkCanceled(orderId: string): Promise<boolean> {
	const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
	return order.status === OrderStatus.CANCELED;
}

export async function transitionToRequestSent(orderId: string, vendorName: string) {
	await transitionOrder(orderId, OrderStatus.REQUEST_SENT, {
		data: { vendorName },
		metadata: { triggeredBy: "workflow-engine", step: "approval" },
	});
}

export async function transitionToConfirmed(
	orderId: string,
	data: {
		vendorOrderNumber: string;
		techFirstName: string;
		techLastName: string;
		techMobilePhone: string;
	},
) {
	await transitionOrder(orderId, OrderStatus.CONFIRMED, {
		data: {
			techFirstName: data.techFirstName,
			techLastName: data.techLastName,
			techMobilePhone: data.techMobilePhone,
		},
		metadata: {
			triggeredBy: "workflow-engine",
			step: "tech-assignment",
			vendorOrderNumber: data.vendorOrderNumber,
		},
	});
}

export async function transitionToManualReview(orderId: string, error: string, attempt: number) {
	await transitionOrder(orderId, OrderStatus.MANUAL_REVIEW, {
		metadata: {
			triggeredBy: "workflow-engine",
			step: "manual-review",
			error,
			reviewAttempt: attempt,
		},
	});
}

export async function transitionToCanceled(orderId: string, metadata: Record<string, unknown>) {
	await transitionOrder(orderId, OrderStatus.CANCELED, { metadata });
}

export async function transitionToFailed(orderId: string, error: string) {
	await transitionOrder(orderId, OrderStatus.FAILED, {
		metadata: {
			triggeredBy: "workflow-engine",
			step: "onFailure",
			error,
		},
	});
}

export async function incrementReviewAttempts(orderId: string): Promise<number> {
	const updated = await prisma.order.update({
		where: { id: orderId },
		data: { manualReviewAttempts: { increment: 1 } },
	});
	return updated.manualReviewAttempts;
}

export async function updateVendorOrderNumber(orderId: string, vendorOrderNumber: string) {
	await prisma.order.update({
		where: { id: orderId },
		data: { vendorOrderNumber },
	});
}

export async function updateVendorName(orderId: string, vendorName: string) {
	await prisma.order.update({
		where: { id: orderId },
		data: { vendorName },
	});
}

export async function retryTransitionToRequestSent(orderId: string, vendorName: string, reviewAttempt: number) {
	await transitionOrder(orderId, OrderStatus.REQUEST_SENT, {
		data: { vendorName },
		metadata: {
			triggeredBy: "workflow-engine",
			step: "retry-after-review",
			reviewAttempt,
		},
	});
}

export async function findStaleOrders(thresholdMinutes: number) {
	const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
	return prisma.order.findMany({
		where: {
			status: OrderStatus.PENDING_APPROVAL,
			createdAt: { lt: threshold },
		},
		select: { id: true },
	});
}
