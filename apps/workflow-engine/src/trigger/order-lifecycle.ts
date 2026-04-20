import { task, wait, logger } from "@trigger.dev/sdk/v3";
import { prisma, OrderStatus, transitionOrder } from "@repo/database";
import { WORKFLOW_CONFIG } from "@repo/config";

const VENDOR_API_URL = process.env.VENDOR_API_URL ?? "http://localhost:3003";

async function checkCanceled(orderId: string): Promise<boolean> {
	const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
	return order.status === OrderStatus.CANCELED;
}

async function callVendorApi(orderId: string, order: { dispatchType: string; siteAddress: string }) {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= WORKFLOW_CONFIG.vendorApi.maxRetries; attempt++) {
		try {
			const response = await fetch(`${VENDOR_API_URL}/dispatch`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					orderId,
					dispatchType: order.dispatchType,
					siteAddress: order.siteAddress,
				}),
			});

			if (response.ok) {
				const { vendorOrderNumber } = await response.json() as { vendorOrderNumber: string };
				return vendorOrderNumber;
			}

			lastError = new Error(`VENDOR_API_FAILED: Vendor API returned ${response.status} for order ${orderId}`);
		} catch (error) {
			lastError = new Error(`VENDOR_API_FAILED: ${String(error)}`);
		}

		logger.warn(`Vendor API attempt ${attempt}/${WORKFLOW_CONFIG.vendorApi.maxRetries} failed for order ${orderId}`);
		if (attempt < WORKFLOW_CONFIG.vendorApi.maxRetries) await wait.for({ seconds: attempt * WORKFLOW_CONFIG.vendorApi.backoffBaseSeconds });
	}

	throw lastError;
}

async function pollForTechAssignment(orderId: string, vendorOrderNumber: string) {
	let polls = 0;

	while (polls < WORKFLOW_CONFIG.techPolling.maxPolls) {
		await wait.for({ seconds: WORKFLOW_CONFIG.techPolling.intervalSeconds });

		if (await checkCanceled(orderId)) {
			logger.info(`Order ${orderId} was canceled, stopping polling`);
			return { status: "CANCELED" as const };
		}

		const techResponse = await fetch(`${VENDOR_API_URL}/dispatch/${vendorOrderNumber}`);
		const techData = await techResponse.json() as {
			status: string;
			techFirstName?: string;
			techLastName?: string;
			techMobilePhone?: string;
		};

		if (techData.status === "assigned") {
			return {
				status: "CONFIRMED" as const,
				techFirstName: techData.techFirstName,
				techLastName: techData.techLastName,
				techMobilePhone: techData.techMobilePhone,
			};
		}

		polls++;
		logger.info(`Poll ${polls}/${WORKFLOW_CONFIG.techPolling.maxPolls} for order ${orderId}: tech not yet assigned`);
	}

	throw new Error(`POLLING_EXCEEDED: Tech assignment polling exceeded ${WORKFLOW_CONFIG.techPolling.maxPolls} attempts for order ${orderId}`);
}

export const orderLifecycle = task({
	id: "order-lifecycle",
	maxDuration: WORKFLOW_CONFIG.lifecycle.maxDuration,
	queue: { concurrencyLimit: WORKFLOW_CONFIG.lifecycle.concurrencyLimit },
	retry: { maxAttempts: 1 },
	run: async (payload: { orderId: string }) => {
		const { orderId } = payload;

		logger.info(`Workflow started for order ${orderId}, waiting for approval`);

		const token = await wait.createToken({
			idempotencyKey: WORKFLOW_CONFIG.approval.tokenKey(orderId),
			timeout: WORKFLOW_CONFIG.approval.timeout,
			tags: [`order:${orderId}`],
		});

		const approval = await wait.forToken<{ vendorName: string }>(token);

		if (!approval.ok) {
			throw new Error(`APPROVAL_TIMEOUT: Approval wait timed out for order ${orderId}`);
		}

		let { vendorName } = approval.output;

		await transitionOrder(orderId, OrderStatus.REQUEST_SENT, {
			data: { vendorName },
			metadata: { triggeredBy: "workflow-engine", step: "approval" },
		});

		logger.info(`Order ${orderId} approved by ${vendorName}, calling vendor API`);

		let reviewAttempts = 0;

		while (reviewAttempts < WORKFLOW_CONFIG.manualReview.maxAttempts) {
			try {
				const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

				const vendorOrderNumber = await callVendorApi(orderId, order);

				await prisma.order.update({
					where: { id: orderId },
					data: { vendorOrderNumber },
				});

				logger.info(`VON ${vendorOrderNumber} stored for order ${orderId}, polling for tech assignment`);

				const pollResult = await pollForTechAssignment(orderId, vendorOrderNumber);

				if (pollResult.status === "CANCELED") {
					return { orderId, vendorOrderNumber, status: "CANCELED" };
				}

				await transitionOrder(orderId, OrderStatus.CONFIRMED, {
					data: {
						techFirstName: pollResult.techFirstName,
						techLastName: pollResult.techLastName,
						techMobilePhone: pollResult.techMobilePhone,
					},
					metadata: {
						triggeredBy: "workflow-engine",
						step: "tech-assignment",
						vendorOrderNumber,
					},
				});

				logger.info(`Order ${orderId} confirmed, tech assigned: ${pollResult.techFirstName} ${pollResult.techLastName}`);
				return { orderId, vendorOrderNumber, status: "CONFIRMED" };
			} catch (error) {
				const errorStr = String(error);
				const isRetryable = errorStr.includes("VENDOR_API_FAILED") || errorStr.includes("POLLING_EXCEEDED");

				if (!isRetryable) throw error;

				reviewAttempts++;

				const updatedOrder = await prisma.order.update({
					where: { id: orderId },
					data: { manualReviewAttempts: { increment: 1 } },
				});

				logger.warn(`Order ${orderId} entering manual review (attempt ${updatedOrder.manualReviewAttempts}/${WORKFLOW_CONFIG.manualReview.maxAttempts}): ${errorStr}`);

				await transitionOrder(orderId, OrderStatus.MANUAL_REVIEW, {
					metadata: {
						triggeredBy: "workflow-engine",
						step: "manual-review",
						error: errorStr,
						reviewAttempt: updatedOrder.manualReviewAttempts,
					},
				});

				const reviewToken = await wait.createToken({
					idempotencyKey: WORKFLOW_CONFIG.manualReview.tokenKey(orderId, updatedOrder.manualReviewAttempts),
					timeout: WORKFLOW_CONFIG.manualReview.timeout,
					tags: [`order:${orderId}`],
				});

				const review = await wait.forToken<{
					action: "retry" | "reassign" | "cancel";
					newVendor?: string;
				}>(reviewToken);

				if (!review.ok) {
					throw new Error(`REVIEW_TIMEOUT: Manual review timed out for order ${orderId}`);
				}

				if (review.output.action === "cancel") {
					await transitionOrder(orderId, OrderStatus.CANCELED, {
						metadata: { triggeredBy: "management-api", action: "cancel-from-review" },
					});
					return { orderId, status: "CANCELED" };
				}

				if (review.output.action === "reassign") {
					vendorName = review.output.newVendor!;
					await prisma.order.update({ where: { id: orderId }, data: { vendorName } });
				}

				await transitionOrder(orderId, OrderStatus.REQUEST_SENT, {
					data: { vendorName },
					metadata: {
						triggeredBy: "workflow-engine",
						step: "retry-after-review",
						reviewAttempt: reviewAttempts,
					},
				});

				logger.info(`Order ${orderId} resuming after review (attempt ${reviewAttempts}): action=${review.output.action}`);
			}
		}

		throw new Error(`WORKFLOW_CONFIG.manualReview.maxAttempts: Order ${orderId} exceeded ${WORKFLOW_CONFIG.manualReview.maxAttempts} manual review attempts`);
	},
	onFailure: async ({ payload, error }) => {
		logger.error(`Workflow failed for order ${payload.orderId}`, { error });

		const errorStr = String(error);
		const userFacingError = errorStr.includes("APPROVAL_TIMEOUT")
			? "Approval timed out"
			: errorStr.includes("WORKFLOW_CONFIG.manualReview.maxAttempts")
				? "Maximum review attempts exceeded"
				: errorStr.includes("REVIEW_TIMEOUT")
					? "Manual review timed out"
					: "Workflow failed";

		try {
			await transitionOrder(payload.orderId, OrderStatus.FAILED, {
				metadata: {
					triggeredBy: "workflow-engine",
					step: "onFailure",
					error: userFacingError,
				},
			});
		} catch {
			logger.error(`Failed to transition order ${payload.orderId} to FAILED`);
		}
	},
});
