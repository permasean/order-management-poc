import { schedules, logger, tasks } from "@trigger.dev/sdk/v3";
import { prisma, OrderStatus } from "@repo/database";

const STALE_THRESHOLD_MINUTES = 5;

export const orphanReconciler = schedules.task({
	id: "orphan-reconciler",
	cron: "*/5 * * * *",
	queue: { concurrencyLimit: 1 },
	maxDuration: 60,
	run: async () => {
		const threshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

		const orphanedOrders = await prisma.order.findMany({
			where: {
				status: OrderStatus.PENDING_APPROVAL,
				createdAt: { lt: threshold },
			},
		});

		if (orphanedOrders.length === 0) {
			return;
		}

		logger.info(`Found ${orphanedOrders.length} orphaned orders, re-triggering workflows`);

		for (const order of orphanedOrders) {
			try {
				await tasks.trigger("order-lifecycle", { orderId: order.id }, {
					idempotencyKey: `order-lifecycle:${order.id}`,
					idempotencyKeyTTL: "24h",
				});
				logger.info(`Re-triggered workflow for order ${order.id}`);
			} catch (err) {
				logger.error(`Failed to re-trigger workflow for order ${order.id}`, { err });
			}
		}
	},
});
