import PDFDocument from "pdfkit";
import { formatDateTime } from "./order-utils";

interface WorkOrderData {
	id: string;
	ticketId: string;
	siteAddress: string;
	scheduledDateTime: Date;
	dispatchType: string;
	vendorName: string | null;
	vendorOrderNumber: string | null;
	techFirstName: string | null;
	techLastName: string | null;
	techMobilePhone: string | null;
	status: string;
	createdAt: Date;
}

export async function generateWorkOrderPdf(order: WorkOrderData): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ margin: 50 });
		const chunks: Buffer[] = [];

		doc.on("data", (chunk: Buffer) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);

		doc.fontSize(22).font("Helvetica-Bold").text("Work Order", { align: "center" });
		doc.fontSize(12).font("Helvetica").text(`Ticket: ${order.ticketId}`, { align: "center" });
		doc.moveDown(1.5);

		doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
		doc.moveDown(1);

		doc.fontSize(16).font("Helvetica-Bold").text("Order Details");
		doc.moveDown(0.5);

		const fields: [string, string][] = [
			["Order ID", order.id],
			["Ticket ID", order.ticketId],
			["Site Address", order.siteAddress],
			["Dispatch Type", order.dispatchType.replace("_", " ")],
			["Scheduled Date/Time", formatDateTime(order.scheduledDateTime)],
			["Created", formatDateTime(order.createdAt)],
		];

		if (order.vendorName) fields.push(["Vendor", order.vendorName]);
		if (order.vendorOrderNumber) fields.push(["Vendor Order Number", order.vendorOrderNumber]);

		doc.fontSize(10);
		for (const [label, value] of fields) {
			doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
			doc.font("Helvetica").text(value);
		}

		if (order.techFirstName) {
			doc.moveDown(1);
			doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
			doc.moveDown(1);

			doc.fontSize(16).font("Helvetica-Bold").text("Technician Information");
			doc.moveDown(0.5);

			doc.fontSize(10);
			doc.font("Helvetica-Bold").text("Name: ", { continued: true });
			doc.font("Helvetica").text(`${order.techFirstName} ${order.techLastName ?? ""}`);

			if (order.techMobilePhone) {
				doc.font("Helvetica-Bold").text("Phone: ", { continued: true });
				doc.font("Helvetica").text(order.techMobilePhone);
			}
		}

		doc.end();
	});
}
