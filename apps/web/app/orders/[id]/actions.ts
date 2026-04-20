"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, OrderStatus, transitionOrder } from "@repo/database";
import { generateWorkOrderPdf } from "@/lib/generate-work-order";

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

const STORAGE_DIR = path.join(process.cwd(), "storage", "work-orders");

export async function downloadWorkOrderPdf(orderId: string): Promise<string> {
	const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

	if (order.workOrderPdfPath) {
		const buffer = await fs.readFile(order.workOrderPdfPath);
		return buffer.toString("base64");
	}

	const pdfBuffer = await generateWorkOrderPdf(order);

	await fs.mkdir(STORAGE_DIR, { recursive: true });
	const filePath = path.join(STORAGE_DIR, `${orderId}.pdf`);
	await fs.writeFile(filePath, pdfBuffer);

	await prisma.order.update({
		where: { id: orderId },
		data: { workOrderPdfPath: filePath },
	});

	return pdfBuffer.toString("base64");
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
