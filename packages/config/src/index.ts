export const WORKFLOW_CONFIG = {
	approval: {
		tokenKey: (orderId: string) => `approval:${orderId}`,
		timeout: "10m" as const,
	},
	manualReview: {
		tokenKey: (orderId: string, attempt: number) => `manual-review:${orderId}:${attempt}`,
		timeout: "7d" as const,
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
		idempotencyKey: (orderId: string) => `order-lifecycle:${orderId}`,
		idempotencyKeyTTL: "24h" as const,
		maxDuration: 86400,
		concurrencyLimit: 10,
	},
};
