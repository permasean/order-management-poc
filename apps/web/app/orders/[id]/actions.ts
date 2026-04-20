"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OrderStatus, transitionOrder } from "@repo/database";

export async function closeoutOrder(orderId: string, closeoutNotes: string) {
	await transitionOrder(orderId, OrderStatus.COMPLETED, {
		data: {
			closeoutNotes,
			completedAt: new Date(),
		},
		metadata: { triggeredBy: "ui", action: "closeout" },
	});

	revalidatePath(`/orders/${orderId}`);
	revalidatePath("/");
}

export async function cancelOrder(orderId: string) {
	await transitionOrder(orderId, OrderStatus.CANCELED, {
		metadata: { triggeredBy: "ui", action: "cancel" },
	});

	revalidatePath(`/orders/${orderId}`);
	revalidatePath("/");
}

const MANAGEMENT_API_URL = process.env.MANAGEMENT_API_URL ?? "http://localhost:3004";

export async function reviewOrder(
	orderId: string,
	decision: { action: "retry" | "reassign" | "cancel"; newVendor?: string },
): Promise<{ error?: string }> {
	const response = await fetch(`${MANAGEMENT_API_URL}/orders/${orderId}/review`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(decision),
	});

	if (!response.ok) {
		const data = await response.json();
		revalidatePath(`/orders/${orderId}`);
		revalidatePath("/");
		return { error: data.error ?? "Failed to submit review decision" };
	}

	revalidatePath(`/orders/${orderId}`);
	revalidatePath("/");
	return {};
}
