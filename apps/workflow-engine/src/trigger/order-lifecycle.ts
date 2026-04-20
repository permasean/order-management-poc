import { task, wait, logger } from "@trigger.dev/sdk/v3";
import { prisma, OrderStatus, transitionOrder } from "@repo/database";

const VENDOR_API_URL = process.env.VENDOR_API_URL ?? "http://localhost:3003";
const MAX_POLLS = 3;
const POLL_INTERVAL_SECONDS = 30;
const MAX_REVIEW_ATTEMPTS = 3;

async function checkCanceled(orderId: string): Promise<boolean> {
	const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
	return order.status === OrderStatus.CANCELED;
}

async function callVendorApi(orderId: string, order: { dispatchType: string; siteAddress: string }) {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= 3; attempt++) {
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

		logger.warn(`Vendor API attempt ${attempt}/3 failed for order ${orderId}`);
		if (attempt < 3) await wait.for({ seconds: attempt * 2 });
	}

	throw lastError;
}

async function pollForTechAssignment(orderId: string, vendorOrderNumber: string) {
	let polls = 0;

	while (polls < MAX_POLLS) {
		await wait.for({ seconds: POLL_INTERVAL_SECONDS });

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
		logger.info(`Poll ${polls}/${MAX_POLLS} for order ${orderId}: tech not yet assigned`);
	}

	throw new Error(`POLLING_EXCEEDED: Tech assignment polling exceeded ${MAX_POLLS} attempts for order ${orderId}`);
}

export const orderLifecycle = task({
	id: "order-lifecycle",
	maxDuration: 86400,
	queue: { concurrencyLimit: 10 },
	retry: { maxAttempts: 1 },
	run: async (payload: { orderId: string }) => {
		const { orderId } = payload;

		logger.info(`Workflow started for order ${orderId}, waiting for approval`);

		const token = await wait.createToken({
			idempotencyKey: `approval:${orderId}`,
			timeout: "10m",
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

		while (reviewAttempts < MAX_REVIEW_ATTEMPTS) {
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

				logger.warn(`Order ${orderId} entering manual review (attempt ${updatedOrder.manualReviewAttempts}/${MAX_REVIEW_ATTEMPTS}): ${errorStr}`);

				await transitionOrder(orderId, OrderStatus.MANUAL_REVIEW, {
					metadata: {
						triggeredBy: "workflow-engine",
						step: "manual-review",
						error: errorStr,
						reviewAttempt: updatedOrder.manualReviewAttempts,
					},
				});

				const reviewToken = await wait.createToken({
					idempotencyKey: `manual-review:${orderId}:${updatedOrder.manualReviewAttempts}`,
					timeout: "7d",
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

		throw new Error(`MAX_REVIEW_ATTEMPTS: Order ${orderId} exceeded ${MAX_REVIEW_ATTEMPTS} manual review attempts`);
	},
	onFailure: async ({ payload, error }) => {
		logger.error(`Workflow failed for order ${payload.orderId}`, { error });

		const errorStr = String(error);
		const userFacingError = errorStr.includes("APPROVAL_TIMEOUT")
			? "Approval timed out"
			: errorStr.includes("MAX_REVIEW_ATTEMPTS")
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
