import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../activities/index.js";
import { WORKFLOW_CONFIG } from "@repo/config";

const { findStaleOrders } = proxyActivities<typeof activities>({
	startToCloseTimeout: "30s",
});

export async function orphanReconciler(): Promise<void> {
	const staleOrders = await findStaleOrders(WORKFLOW_CONFIG.reconciler.staleThresholdMinutes);

	if (staleOrders.length === 0) {
		return;
	}

	log.info(`Found ${staleOrders.length} orphaned orders, re-triggering workflows`);
}
