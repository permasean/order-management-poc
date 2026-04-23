import {
	proxyActivities,
	sleep,
	condition,
	setHandler,
	log,
	ApplicationFailure,
	ActivityFailure,
} from "@temporalio/workflow";
import { approvalSignal, reviewSignal } from "../shared.js";
import type * as activities from "../activities/index.js";
import { WORKFLOW_CONFIG } from "@repo/config";

const {
	callVendorApi,
	pollTechAssignment,
} = proxyActivities<typeof activities>({
	startToCloseTimeout: "60s",
	retry: {
		maximumAttempts: WORKFLOW_CONFIG.vendorApi.maxRetries,
		initialInterval: `${WORKFLOW_CONFIG.vendorApi.backoffBaseSeconds}s`,
		backoffCoefficient: 2,
	},
});

const {
	checkCanceled,
	transitionToRequestSent,
	transitionToConfirmed,
	transitionToManualReview,
	transitionToCanceled,
	transitionToFailed,
	incrementReviewAttempts,
	updateVendorOrderNumber,
	updateVendorName,
	retryTransitionToRequestSent,
} = proxyActivities<typeof activities>({
	startToCloseTimeout: "10s",
});

export async function orderLifecycle(input: { orderId: string }): Promise<{
	orderId: string;
	status: string;
	vendorOrderNumber?: string;
}> {
	const { orderId } = input;
	let approvalData: { vendorName: string } | undefined;
	let reviewData: { action: "retry" | "reassign" | "cancel"; newVendor?: string } | undefined;

	setHandler(approvalSignal, (data) => {
		approvalData = data;
	});
	setHandler(reviewSignal, (data) => {
		reviewData = data;
	});

	log.info("Workflow started, waiting for approval", { orderId });

	const approved = await condition(
		() => approvalData !== undefined,
		WORKFLOW_CONFIG.approval.timeoutMs,
	);

	if (!approved || !approvalData) {
		await transitionToFailed(orderId, "Approval timed out");
		return { orderId, status: "FAILED" };
	}

	let { vendorName } = approvalData;
	await transitionToRequestSent(orderId, vendorName);

	log.info("Order approved, calling vendor API", { orderId, vendorName });

	let reviewAttempts = 0;

	while (reviewAttempts < WORKFLOW_CONFIG.manualReview.maxAttempts) {
		try {
			const vendorOrderNumber = await callVendorApi(orderId);
			await updateVendorOrderNumber(orderId, vendorOrderNumber);

			log.info("VON stored, polling for tech assignment", { orderId, vendorOrderNumber });

			for (let poll = 0; poll < WORKFLOW_CONFIG.techPolling.maxPolls; poll++) {
				await sleep(WORKFLOW_CONFIG.techPolling.intervalSeconds * 1000);

				if (await checkCanceled(orderId)) {
					log.info("Order canceled during polling", { orderId });
					return { orderId, vendorOrderNumber, status: "CANCELED" };
				}

				const techData = await pollTechAssignment(vendorOrderNumber);

				if (techData) {
					await transitionToConfirmed(orderId, { vendorOrderNumber, ...techData });
					log.info("Order confirmed, tech assigned", {
						orderId,
						techFirstName: techData.techFirstName,
						techLastName: techData.techLastName,
					});
					return { orderId, vendorOrderNumber, status: "CONFIRMED" };
				}

				log.info(`Poll ${poll + 1}/${WORKFLOW_CONFIG.techPolling.maxPolls}: tech not yet assigned`, { orderId });
			}

			throw ApplicationFailure.nonRetryable(
				`POLLING_EXCEEDED: Tech assignment polling exceeded ${WORKFLOW_CONFIG.techPolling.maxPolls} attempts for order ${orderId}`,
			);
		} catch (error) {
			const rootCause = error instanceof ActivityFailure ? String(error.cause) : String(error);
			const errorStr = `${String(error)} ${rootCause}`;
			const isRetryable = errorStr.includes("VENDOR_API_FAILED") || errorStr.includes("POLLING_EXCEEDED");

			if (!isRetryable) throw error;

			reviewAttempts++;
			const attempt = await incrementReviewAttempts(orderId);

			log.warn(`Entering manual review (attempt ${attempt}/${WORKFLOW_CONFIG.manualReview.maxAttempts})`, {
				orderId,
				error: errorStr,
			});

			await transitionToManualReview(orderId, errorStr, attempt);

			reviewData = undefined;
			const reviewed = await condition(
				() => reviewData !== undefined,
				WORKFLOW_CONFIG.manualReview.timeoutMs,
			);

			if (!reviewed || !reviewData) {
				await transitionToFailed(orderId, "Manual review timed out");
				return { orderId, status: "FAILED" };
			}

			const decision = reviewData as { action: "retry" | "reassign" | "cancel"; newVendor?: string };

			if (decision.action === "cancel") {
				await transitionToCanceled(orderId, {
					triggeredBy: "management-api",
					action: "cancel-from-review",
				});
				return { orderId, status: "CANCELED" };
			}

			if (decision.action === "reassign") {
				vendorName = decision.newVendor!;
				await updateVendorName(orderId, vendorName);
			}

			await retryTransitionToRequestSent(orderId, vendorName, reviewAttempts);
			log.info("Resuming after review", { orderId, reviewAttempts, action: decision.action });
		}
	}

	await transitionToFailed(orderId, `Maximum review attempts exceeded (${WORKFLOW_CONFIG.manualReview.maxAttempts})`);
	return { orderId, status: "FAILED" };
}
