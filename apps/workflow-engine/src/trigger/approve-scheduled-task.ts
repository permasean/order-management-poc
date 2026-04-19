import { logger, schedules } from "@trigger.dev/sdk/v3";
import { getUnprocessedEvents, markEventProcessed } from "../helpers/outbox.js";
import { vendorIntegration } from "./vendor-integration.js";

export const outboxProcessor = schedules.task({
	id: "outbox-processor",
	cron: "*/30 * * * * *",
	maxDuration: 60,
	queue: { concurrencyLimit: 1 },
	run: async () => {
		const events = await getUnprocessedEvents("order.approved");

		if (events.length === 0) {
			return;
		}

		logger.info(`Processing ${events.length} outbox events`);

		for (const event of events) {
			try {
				const payload = event.payload as { orderId: string };
				await vendorIntegration.trigger(payload);
				await markEventProcessed(event.id);
				logger.info(`Processed event ${event.id}`);
			} catch (err) {
				logger.error(`Failed to process event ${event.id}`, { err });
			}
		}
	},
});