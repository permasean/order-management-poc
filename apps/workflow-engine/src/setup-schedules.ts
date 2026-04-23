import { Client, Connection } from "@temporalio/client";
import { WORKFLOW_CONFIG } from "@repo/config";

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";

async function main() {
	console.log(`Connecting to Temporal at ${TEMPORAL_ADDRESS}...`);
	const connection = await Connection.connect({
		address: TEMPORAL_ADDRESS,
	});
	const client = new Client({ connection });

	const scheduleId = WORKFLOW_CONFIG.reconciler.scheduleId;

	try {
		const existing = client.schedule.getHandle(scheduleId);
		await existing.delete();
		console.log(`Deleted existing schedule: ${scheduleId}`);
	} catch {
	}

	await client.schedule.create({
		scheduleId,
		spec: {
			cronExpressions: [WORKFLOW_CONFIG.reconciler.cron],
		},
		action: {
			type: "startWorkflow",
			workflowType: "orphanReconciler",
			taskQueue: WORKFLOW_CONFIG.lifecycle.taskQueue,
		},
	});

	console.log(`Created schedule: ${scheduleId} (${WORKFLOW_CONFIG.reconciler.cron})`);
	process.exit(0);
}

main().catch((err) => {
	console.error("Failed to setup schedules:", err);
	process.exit(1);
});
