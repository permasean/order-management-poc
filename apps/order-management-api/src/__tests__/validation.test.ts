import { describe, it, expect } from "vitest";
import { reviewSchema } from "../validation/reviewSchema.js";

describe("reviewSchema", () => {
	it("should accept retry action", () => {
		const result = reviewSchema.safeParse({ action: "retry" });
		expect(result.success).toBe(true);
	});

	it("should accept cancel action", () => {
		const result = reviewSchema.safeParse({ action: "cancel" });
		expect(result.success).toBe(true);
	});

	it("should accept reassign with newVendor", () => {
		const result = reviewSchema.safeParse({ action: "reassign", newVendor: "New Vendor" });
		expect(result.success).toBe(true);
	});

	it("should reject reassign without newVendor", () => {
		const result = reviewSchema.safeParse({ action: "reassign" });
		expect(result.success).toBe(false);
	});

	it("should reject reassign with empty newVendor", () => {
		const result = reviewSchema.safeParse({ action: "reassign", newVendor: "" });
		expect(result.success).toBe(false);
	});

	it("should reject invalid action", () => {
		const result = reviewSchema.safeParse({ action: "invalid" });
		expect(result.success).toBe(false);
	});

	it("should reject missing action", () => {
		const result = reviewSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it("should ignore newVendor for non-reassign actions", () => {
		const result = reviewSchema.safeParse({ action: "retry", newVendor: "Ignored Vendor" });
		expect(result.success).toBe(true);
	});
});
