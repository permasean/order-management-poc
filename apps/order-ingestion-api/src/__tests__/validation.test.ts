import { describe, it, expect } from "vitest";
import { createOrderSchema } from "../validation/orderSchema.js";
import { approvalSchema } from "../validation/approvalSchema.js";

describe("createOrderSchema", () => {
	const validInput = {
		ticketId: "TKT-001",
		siteAddress: "123 Main St",
		scheduledDateTime: "2026-05-01T10:00:00Z",
		dispatchType: "New Install",
	};

	it("should accept valid input", () => {
		const result = createOrderSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it("should accept all dispatch types", () => {
		for (const type of ["New Install", "Repair", "Site Survey"]) {
			const result = createOrderSchema.safeParse({ ...validInput, dispatchType: type });
			expect(result.success).toBe(true);
		}
	});

	it("should reject missing ticketId", () => {
		const { ticketId, ...input } = validInput;
		const result = createOrderSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("should reject empty ticketId", () => {
		const result = createOrderSchema.safeParse({ ...validInput, ticketId: "" });
		expect(result.success).toBe(false);
	});

	it("should reject missing siteAddress", () => {
		const { siteAddress, ...input } = validInput;
		const result = createOrderSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("should reject missing scheduledDateTime", () => {
		const { scheduledDateTime, ...input } = validInput;
		const result = createOrderSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("should reject invalid scheduledDateTime", () => {
		const result = createOrderSchema.safeParse({
			...validInput,
			scheduledDateTime: "not-a-date",
		});
		expect(result.success).toBe(false);
	});

	it("should reject invalid dispatchType", () => {
		const result = createOrderSchema.safeParse({
			...validInput,
			dispatchType: "Invalid Type",
		});
		expect(result.success).toBe(false);
	});

	it("should reject missing dispatchType", () => {
		const { dispatchType, ...input } = validInput;
		const result = createOrderSchema.safeParse(input);
		expect(result.success).toBe(false);
	});
});

describe("approvalSchema", () => {
	const validInput = {
		orderId: "550e8400-e29b-41d4-a716-446655440000",
		vendorName: "Acme Field Services",
	};

	it("should accept valid input", () => {
		const result = approvalSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it("should reject missing orderId", () => {
		const { orderId, ...input } = validInput;
		const result = approvalSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("should reject missing vendorName", () => {
		const { vendorName, ...input } = validInput;
		const result = approvalSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("should reject empty vendorName", () => {
		const result = approvalSchema.safeParse({ ...validInput, vendorName: "" });
		expect(result.success).toBe(false);
	});
});
