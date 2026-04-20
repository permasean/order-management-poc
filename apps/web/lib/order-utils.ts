import type { OrderStatus } from "@repo/database";

export const statusColorMap: Record<OrderStatus, string> = {
	PENDING_APPROVAL: "bg-yellow-100 text-yellow-800",
	REQUEST_SENT: "bg-orange-100 text-orange-800",
	CONFIRMED: "bg-blue-100 text-blue-800",
	COMPLETED: "bg-green-100 text-green-800",
	CANCELED: "bg-gray-100 text-gray-800",
	FAILED: "bg-red-100 text-red-800",
};

export function formatStatus(status: string): string {
	return status
		.split("_")
		.map((word) => word.charAt(0) + word.slice(1).toLowerCase())
		.join(" ");
}

export function isTerminalStatus(status: OrderStatus): boolean {
	return (["COMPLETED", "CANCELED", "FAILED"] as string[]).includes(status);
}

export function formatDateTime(date: Date | string): string {
	return new Date(date).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
