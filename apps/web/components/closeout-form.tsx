"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { closeoutOrder } from "@/app/orders/[id]/actions";

export function CloseoutForm({ orderId }: { orderId: string }) {
	const [notes, setNotes] = useState("");
	const [pending, setPending] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setPending(true);
		await closeoutOrder(orderId, notes);
		setPending(false);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Close Out Order</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<Textarea
						placeholder="Enter closeout notes..."
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						required
					/>
					<Button type="submit" disabled={pending || !notes.trim()}>
						{pending ? "Submitting..." : "Submit Closeout"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
