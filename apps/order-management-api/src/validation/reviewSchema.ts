import { z } from "zod";

export const reviewSchema = z.object({
	action: z.enum(["retry", "reassign", "cancel"]),
	newVendor: z.string().min(1).optional(),
}).refine(
	(data) => data.action !== "reassign" || data.newVendor,
	{ message: "newVendor is required when action is reassign", path: ["newVendor"] },
);

export type ReviewInput = z.infer<typeof reviewSchema>;
