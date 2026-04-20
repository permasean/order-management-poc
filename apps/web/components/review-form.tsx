"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reviewOrder } from "@/app/orders/[id]/actions";

export function ReviewForm({ orderId }: { orderId: string }) {
	const router = useRouter();
	const [action, setAction] = useState<string>("");
	const [newVendor, setNewVendor] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const actionLabels: Record<string, string> = {
		retry: "Retry with same vendor",
		reassign: "Reassign to different vendor",
		cancel: "Cancel order",
	};

	async function handleSubmit() {
		if (!action) return;
		setIsSubmitting(true);
		setError(null);

		const result = await reviewOrder(orderId, {
			action: action as "retry" | "reassign" | "cancel",
			newVendor: action === "reassign" ? newVendor : undefined,
		});

		if (result?.error) {
			setError(result.error);
			setIsSubmitting(false);
		} else {
			setSubmitted(true);
		}
	}

	if (submitted) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Manual Review</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-green-700">Decision submitted successfully. The workflow is resuming.</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Manual Review</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground mb-4">
					This order requires manual review. Choose an action:
				</p>

				{error && (
					<div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
						{error}
					</div>
				)}

				<div className="flex flex-col gap-4 max-w-md">
					<Select value={action} onValueChange={setAction}>
						<SelectTrigger className="w-full">
							{action ? actionLabels[action] : "Select action..."}
						</SelectTrigger>
						<SelectContent position="popper" className="w-[--radix-select-trigger-width]">
							<SelectItem value="retry">Retry with same vendor</SelectItem>
							<SelectItem value="reassign">Reassign to different vendor</SelectItem>
							<SelectItem value="cancel">Cancel order</SelectItem>
						</SelectContent>
					</Select>

					{action === "reassign" && (
						<Select value={newVendor} onValueChange={setNewVendor}>
							<SelectTrigger className="w-full">
								{newVendor || "Select vendor..."}
							</SelectTrigger>
							<SelectContent position="popper" className="w-[--radix-select-trigger-width]">
								<SelectItem value="Acme Field Services">Acme Field Services</SelectItem>
								<SelectItem value="TechForce Solutions">TechForce Solutions</SelectItem>
								<SelectItem value="Premier Dispatch Co">Premier Dispatch Co</SelectItem>
							</SelectContent>
						</Select>
					)}

					<Button
						onClick={handleSubmit}
						disabled={isSubmitting || !action || (action === "reassign" && !newVendor)}
						className="w-fit"
					>
						{isSubmitting ? "Submitting..." : "Submit Decision"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
