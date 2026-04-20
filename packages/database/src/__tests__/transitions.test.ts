import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = {
	findUniqueOrThrow: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	transaction: vi.fn(),
};

vi.mock("@prisma/client", () => {
	const OrderStatus = {
		PENDING_APPROVAL: "PENDING_APPROVAL",
		REQUEST_SENT: "REQUEST_SENT",
		CONFIRMED: "CONFIRMED",
		COMPLETED: "COMPLETED",
		CANCELED: "CANCELED",
		FAILED: "FAILED",
		MANUAL_REVIEW: "MANUAL_REVIEW",
	};
	const DispatchType = {
		NEW_INSTALL: "NEW_INSTALL",
		REPAIR: "REPAIR",
		SITE_SURVEY: "SITE_SURVEY",
	};
	return {
		OrderStatus,
		DispatchType,
		PrismaClient: class {
			$transaction = (...args: unknown[]) => mocks.transaction(...args);
		},
	};
});

import { transitionOrder, OrderStatus } from "../index";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
		const tx = {
			order: { findUniqueOrThrow: mocks.findUniqueOrThrow, update: mocks.update },
			statusHistory: { create: mocks.create },
		};
		return fn(tx);
	});
});

function mockOrder(status: string, overrides = {}) {
	return {
		id: "order-1",
		status,
		ticketId: "TKT-001",
		siteAddress: "123 Test St",
		...overrides,
	};
}

describe("transitionOrder", () => {
	it("should transition PENDING_APPROVAL to REQUEST_SENT", async () => {
		mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("PENDING_APPROVAL"));
		mocks.update.mockResolvedValue(mockOrder("REQUEST_SENT"));

		const result = await transitionOrder("order-1", OrderStatus.REQUEST_SENT);

		expect(result.status).toBe(OrderStatus.REQUEST_SENT);
	});

	it("should create a StatusHistory record", async () => {
		mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("PENDING_APPROVAL"));
		mocks.update.mockResolvedValue(mockOrder("REQUEST_SENT"));

		await transitionOrder("order-1", OrderStatus.REQUEST_SENT);

		expect(mocks.create).toHaveBeenCalledWith({
			data: {
				orderId: "order-1",
				fromStatus: "PENDING_APPROVAL",
				toStatus: "REQUEST_SENT",
				metadata: undefined,
			},
		});
	});

	it("should store metadata in StatusHistory", async () => {
		mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("PENDING_APPROVAL"));
		mocks.update.mockResolvedValue(mockOrder("REQUEST_SENT"));

		await transitionOrder("order-1", OrderStatus.REQUEST_SENT, {
			metadata: { triggeredBy: "test", step: "approval" },
		});

		expect(mocks.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				metadata: { triggeredBy: "test", step: "approval" },
			}),
		});
	});

	it("should pass additional data fields to update", async () => {
		mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("PENDING_APPROVAL"));
		mocks.update.mockResolvedValue(mockOrder("REQUEST_SENT", { vendorName: "Test Vendor" }));

		await transitionOrder("order-1", OrderStatus.REQUEST_SENT, {
			data: { vendorName: "Test Vendor" },
		});

		expect(mocks.update).toHaveBeenCalledWith({
			where: { id: "order-1" },
			data: { vendorName: "Test Vendor", status: "REQUEST_SENT" },
		});
	});

	it("should reject invalid transitions", async () => {
		mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("PENDING_APPROVAL"));

		await expect(
			transitionOrder("order-1", OrderStatus.COMPLETED),
		).rejects.toThrow("Invalid transition: PENDING_APPROVAL → COMPLETED");

		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("should reject transitions from terminal statuses", async () => {
		mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("COMPLETED"));

		await expect(
			transitionOrder("order-1", OrderStatus.CANCELED),
		).rejects.toThrow("Invalid transition: COMPLETED → CANCELED");
	});

	it("should reject self-transitions", async () => {
		mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("PENDING_APPROVAL"));

		await expect(
			transitionOrder("order-1", OrderStatus.PENDING_APPROVAL),
		).rejects.toThrow("Invalid transition: PENDING_APPROVAL → PENDING_APPROVAL");
	});

	it("should propagate error when order not found", async () => {
		mocks.findUniqueOrThrow.mockRejectedValue(new Error("Record not found"));

		await expect(
			transitionOrder("non-existent", OrderStatus.REQUEST_SENT),
		).rejects.toThrow("Record not found");
	});

	describe("valid transition paths", () => {
		it("should allow PENDING_APPROVAL → CANCELED", async () => {
			mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("PENDING_APPROVAL"));
			mocks.update.mockResolvedValue(mockOrder("CANCELED"));

			const result = await transitionOrder("order-1", OrderStatus.CANCELED);
			expect(result.status).toBe("CANCELED");
		});

		it("should allow REQUEST_SENT → MANUAL_REVIEW", async () => {
			mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("REQUEST_SENT"));
			mocks.update.mockResolvedValue(mockOrder("MANUAL_REVIEW"));

			const result = await transitionOrder("order-1", OrderStatus.MANUAL_REVIEW);
			expect(result.status).toBe("MANUAL_REVIEW");
		});

		it("should allow MANUAL_REVIEW → REQUEST_SENT", async () => {
			mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("MANUAL_REVIEW"));
			mocks.update.mockResolvedValue(mockOrder("REQUEST_SENT"));

			const result = await transitionOrder("order-1", OrderStatus.REQUEST_SENT);
			expect(result.status).toBe("REQUEST_SENT");
		});

		it("should allow MANUAL_REVIEW → CANCELED", async () => {
			mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("MANUAL_REVIEW"));
			mocks.update.mockResolvedValue(mockOrder("CANCELED"));

			const result = await transitionOrder("order-1", OrderStatus.CANCELED);
			expect(result.status).toBe("CANCELED");
		});

		it("should allow CONFIRMED → COMPLETED with closeout data", async () => {
			mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("CONFIRMED"));
			mocks.update.mockResolvedValue(mockOrder("COMPLETED", { closeoutNotes: "Job done" }));

			const result = await transitionOrder("order-1", OrderStatus.COMPLETED, {
				data: { closeoutNotes: "Job done", completedAt: new Date() },
			});
			expect(result.status).toBe("COMPLETED");
		});

		it("should reject FAILED → anything", async () => {
			mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("FAILED"));

			await expect(
				transitionOrder("order-1", OrderStatus.PENDING_APPROVAL),
			).rejects.toThrow("Invalid transition: FAILED → PENDING_APPROVAL");
		});

		it("should reject CANCELED → anything", async () => {
			mocks.findUniqueOrThrow.mockResolvedValue(mockOrder("CANCELED"));

			await expect(
				transitionOrder("order-1", OrderStatus.PENDING_APPROVAL),
			).rejects.toThrow("Invalid transition: CANCELED → PENDING_APPROVAL");
		});
	});
});
