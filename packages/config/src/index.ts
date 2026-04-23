export const WORKFLOW_CONFIG = {
	approval: {
		signalName: "approval",
		timeoutMs: 10 * 60 * 1000,
	},
	manualReview: {
		signalName: "manual-review",
		timeoutMs: 7 * 24 * 60 * 60 * 1000,
		maxAttempts: 3,
	},
	vendorApi: {
		maxRetries: 3,
		backoffBaseSeconds: 2,
	},
	techPolling: {
		intervalSeconds: 30,
		maxPolls: 3,
	},
	lifecycle: {
		taskQueue: "order-lifecycle",
		workflowId: (orderId: string) => `order-lifecycle:${orderId}`,
		workflowExecutionTimeout: "24h",
		concurrencyLimit: 10,
	},
	reconciler: {
		scheduleId: "orphan-reconciler",
		cron: "*/5 * * * *",
		staleThresholdMinutes: 5,
	},
};
