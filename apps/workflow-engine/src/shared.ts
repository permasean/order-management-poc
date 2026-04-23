import { defineSignal } from "@temporalio/workflow";

export const approvalSignal = defineSignal<[{ vendorName: string }]>("approval");

export const reviewSignal = defineSignal<[{
	action: "retry" | "reassign" | "cancel";
	newVendor?: string;
}]>("manual-review");
