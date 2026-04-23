import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/index.js";
import { WORKFLOW_CONFIG } from "@repo/config";

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";

async function main() {
	const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS });

	const worker = await Worker.create({
		connection,
		workflowsPath: new URL("./workflows/index.ts", import.meta.url).pathname,
		activities,
		taskQueue: WORKFLOW_CONFIG.lifecycle.taskQueue,
		maxConcurrentWorkflowTaskExecutions: WORKFLOW_CONFIG.lifecycle.concurrencyLimit,
	});

	console.log("Temporal worker started");
	await worker.run();
}

main().catch((err) => {
	console.error("Worker failed:", err);
	process.exit(1);
});
