"use server";

import { revalidatePath } from "next/cache";
import { prisma, OrderStatus } from "@repo/database";

export async function closeoutOrder(orderId: string, closeoutNotes: string) {
	await prisma.$transaction(async (tx) => {
		const order = await tx.order.findUniqueOrThrow({
			where: { id: orderId },
		});

		if (order.status !== OrderStatus.CONFIRMED) {
			throw new Error("Order must be in CONFIRMED status to close out");
		}

		await tx.statusHistory.create({
			data: {
				orderId,
				fromStatus: order.status,
				toStatus: OrderStatus.COMPLETED,
			},
		});

		await tx.order.update({
			where: { id: orderId },
			data: {
				status: OrderStatus.COMPLETED,
				closeoutNotes,
				completedAt: new Date(),
			},
		});
	});

	revalidatePath(`/orders/${orderId}`);
	revalidatePath("/");
}

export async function cancelOrder(orderId: string) {
	await prisma.$transaction(async (tx) => {
		const order = await tx.order.findUniqueOrThrow({
			where: { id: orderId },
		});

		const terminalStatuses: string[] = [OrderStatus.COMPLETED, OrderStatus.CANCELED, OrderStatus.FAILED];
		if (terminalStatuses.includes(order.status)) {
			throw new Error("Cannot cancel an order in a terminal status");
		}

		await tx.statusHistory.create({
			data: {
				orderId,
				fromStatus: order.status,
				toStatus: OrderStatus.CANCELED,
			},
		});

		await tx.order.update({
			where: { id: orderId },
			data: { status: OrderStatus.CANCELED },
		});
	});

	revalidatePath(`/orders/${orderId}`);
	revalidatePath("/");
}
