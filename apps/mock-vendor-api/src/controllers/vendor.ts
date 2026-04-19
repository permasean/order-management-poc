import { randomUUID } from "crypto";
import type { Request, Response } from "express";

const techAssignments = new Map<string, { assignedAt: number; pollCount: number }>();

const POLLS_BEFORE_ASSIGNED = 3;

export function submitDispatch(req: Request, res: Response) {
	const failRate = parseFloat(String(req.query.failRate ?? "0"));

	if (Math.random() < failRate) {
		res.status(500).json({ error: "Vendor API temporarily unavailable" });
		return;
	}

	const { orderId, dispatchType, siteAddress } = req.body;

	if (!orderId || !dispatchType || !siteAddress) {
		res.status(400).json({ error: "Missing required fields: orderId, dispatchType, siteAddress" });
		return;
	}

	const vendorOrderNumber = `VON-${randomUUID().slice(0, 8).toUpperCase()}`;

	techAssignments.set(vendorOrderNumber, { assignedAt: Date.now(), pollCount: 0 });

	res.status(201).json({ vendorOrderNumber });
}

export function checkTechAssignment(req: Request<{ von: string }>, res: Response) {
	const { von } = req.params;

	const record = techAssignments.get(von);

	if (!record) {
		res.status(404).json({ error: "Vendor order not found" });
		return;
	}

	record.pollCount++;

	if (record.pollCount < POLLS_BEFORE_ASSIGNED) {
		res.status(200).json({ status: "pending" });
		return;
	}

	res.status(200).json({
		status: "assigned",
		techFirstName: "John",
		techLastName: "Smith",
		techMobilePhone: "555-0123",
	});
}
