import { PrismaClient, OrderStatus, DispatchType, type Prisma } from "@prisma/client";

export { OrderStatus, DispatchType };
export type { Prisma, Order, StatusHistory } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma =
	globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	PENDING_APPROVAL: [OrderStatus.REQUEST_SENT, OrderStatus.CANCELED, OrderStatus.FAILED],
	REQUEST_SENT: [OrderStatus.CONFIRMED, OrderStatus.CANCELED, OrderStatus.FAILED, OrderStatus.MANUAL_REVIEW],
	CONFIRMED: [OrderStatus.COMPLETED, OrderStatus.CANCELED, OrderStatus.FAILED],
	COMPLETED: [],
	CANCELED: [],
	FAILED: [],
	MANUAL_REVIEW: [OrderStatus.REQUEST_SENT, OrderStatus.CANCELED],
};

export async function transitionOrder(
	orderId: string,
	toStatus: OrderStatus,
	options?: {
		data?: Prisma.OrderUpdateInput;
		metadata?: Record<string, unknown>;
	},
) {
	return prisma.$transaction(async (tx) => {
		const order = await tx.order.findUniqueOrThrow({
			where: { id: orderId },
		});

		const allowed = VALID_TRANSITIONS[order.status];
		if (!allowed.includes(toStatus)) {
			throw new Error(`Invalid transition: ${order.status} → ${toStatus}`);
		}

		await tx.statusHistory.create({
			data: {
				orderId,
				fromStatus: order.status,
				toStatus,
				metadata: (options?.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
			},
		});

		return tx.order.update({
			where: { id: orderId },
			data: {
				...options?.data,
				status: toStatus,
			},
		});
	});
}
