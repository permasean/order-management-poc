import { prisma } from "@repo/database";

export async function getUnprocessedEvents(eventType: string) {
	return prisma.outboxEvent.findMany({
		where: { eventType, processed: false },
		orderBy: { createdAt: "asc" },
	});
}

export async function markEventProcessed(id: string) {
	return prisma.outboxEvent.update({
		where: { id },
		data: { processed: true },
	});
}
