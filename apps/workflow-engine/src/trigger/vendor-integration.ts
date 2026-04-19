import { task, logger } from "@trigger.dev/sdk/v3";
import { prisma, OrderStatus } from "@repo/database";

const VENDOR_API_URL = process.env.VENDOR_API_URL ?? "http://localhost:3003";

export const vendorIntegration = task({
	id: "vendor-integration",
	queue: { concurrencyLimit: 10 },
	retry: {
		maxAttempts: 3,
		factor: 2,
		minTimeoutInMs: 1000,
		maxTimeoutInMs: 10000,
		randomize: true,
	},
	run: async (payload: { orderId: string }) => {
		const order = await prisma.order.findUnique({
			where: { id: payload.orderId },
		});

		if (!order) {
			throw new Error(`Order ${payload.orderId} not found`);
		}

		if (order.status !== OrderStatus.REQUEST_SENT) {
			logger.warn(`Order ${payload.orderId} is not in REQUEST_SENT status, skipping`);
			return;
		}

		const response = await fetch(`${VENDOR_API_URL}/dispatch`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				orderId: order.id,
				dispatchType: order.dispatchType,
				siteAddress: order.siteAddress,
			}),
		});

		if (!response.ok) {
			throw new Error(`Vendor API returned ${response.status}`);
		}

		const { vendorOrderNumber } = await response.json() as { vendorOrderNumber: string };

		await prisma.order.update({
			where: { id: payload.orderId },
			data: { vendorOrderNumber },
		});

		logger.info(`Stored VON ${vendorOrderNumber} for order ${payload.orderId}`);

		return { vendorOrderNumber };
	},
	onFailure: async ({ payload, error }) => {
		logger.error(`Vendor integration failed permanently for order ${payload.orderId}`, { error });
	},
});
