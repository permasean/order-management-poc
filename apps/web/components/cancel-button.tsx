"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelOrder } from "@/app/orders/[id]/actions";

export function CancelButton({ orderId }: { orderId: string }) {
	const [pending, setPending] = useState(false);

	async function handleCancel() {
		if (!window.confirm("Are you sure you want to cancel this order?")) return;
		setPending(true);
		await cancelOrder(orderId);
		setPending(false);
	}

	return (
		<Button variant="destructive" disabled={pending} onClick={handleCancel}>
			{pending ? "Canceling..." : "Cancel Order"}
		</Button>
	);
}
