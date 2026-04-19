import { logger, schedules, wait } from "@trigger.dev/sdk/v3";
import { getUnprocessedEvents } from "../helpers/outbox";

export const firstScheduledTask = schedules.task({
  id: "approve-scheduled-task",
  // Every hour
  cron: "0 * * * *",
  // Set an optional maxDuration to prevent tasks from running indefinitely
  maxDuration: 900, // Stop executing after 900 secs (15 mins) of compute
  run: async (payload, { ctx }) => {
    // The payload contains the last run timestamp that you can use to check if this is the first run
    // And calculate the time since the last run
    const outboxEvents = getUnprocessedEvents("order.approved");
  },
});