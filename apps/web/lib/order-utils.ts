import type { OrderStatus } from "@repo/database";

export const statusColorMap: Record<OrderStatus, string> = {
	PENDING_APPROVAL: "bg-yellow-100 text-yellow-800",
	REQUEST_SENT: "bg-orange-100 text-orange-800",
	CONFIRMED: "bg-blue-100 text-blue-800",
	COMPLETED: "bg-green-100 text-green-800",
	CANCELED: "bg-gray-100 text-gray-800",
	FAILED: "bg-red-100 text-red-800",
	MANUAL_REVIEW: "bg-purple-100 text-purple-800",
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

export function formatError(error: string): string {
	if (error.includes("VENDOR_API_FAILED")) return "Vendor API call failed after retries";
	if (error.includes("POLLING_EXCEEDED")) return "Tech assignment polling exceeded maximum attempts";
	if (error.includes("APPROVAL_TIMEOUT")) return "Approval timed out";
	if (error.includes("MAX_REVIEW_ATTEMPTS")) return "Maximum review attempts exceeded";
	if (error.includes("REVIEW_TIMEOUT")) return "Manual review timed out";
	return "Workflow error";
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
