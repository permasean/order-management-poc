import { z } from "zod";

export const approvalSchema = z.object({
  orderId: z.string().uuid("orderId must be a valid UUID"),
  vendorName: z.string().min(1, "vendorName is required"),
});

export type ApprovalInput = z.infer<typeof approvalSchema>;
