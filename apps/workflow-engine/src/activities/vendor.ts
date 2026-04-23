import { prisma } from "@repo/database";

const VENDOR_API_URL = process.env.VENDOR_API_URL ?? "http://localhost:3003";

export async function callVendorApi(orderId: string): Promise<string> {
	const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

	const response = await fetch(`${VENDOR_API_URL}/dispatch`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			orderId,
			dispatchType: order.dispatchType,
			siteAddress: order.siteAddress,
		}),
	});

	if (!response.ok) {
		throw new Error(`VENDOR_API_FAILED: Vendor API returned ${response.status} for order ${orderId}`);
	}

	const { vendorOrderNumber } = await response.json() as { vendorOrderNumber: string };
	return vendorOrderNumber;
}

export async function pollTechAssignment(vendorOrderNumber: string): Promise<{
	techFirstName: string;
	techLastName: string;
	techMobilePhone: string;
} | null> {
	const response = await fetch(`${VENDOR_API_URL}/dispatch/${vendorOrderNumber}`);
	const data = await response.json() as {
		status: string;
		techFirstName?: string;
		techLastName?: string;
		techMobilePhone?: string;
	};

	if (data.status === "assigned") {
		return {
			techFirstName: data.techFirstName!,
			techLastName: data.techLastName!,
			techMobilePhone: data.techMobilePhone!,
		};
	}

	return null;
}
