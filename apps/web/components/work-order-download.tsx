"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadWorkOrderPdf } from "@/app/orders/[id]/actions";

export function WorkOrderDownload({ orderId }: { orderId: string }) {
	const [isGenerating, setIsGenerating] = useState(false);

	async function handleDownload() {
		setIsGenerating(true);

		try {
			const base64 = await downloadWorkOrderPdf(orderId);
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			const blob = new Blob([bytes], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `work-order-${orderId}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			setIsGenerating(false);
		}
	}

	return (
		<Button variant="outline" onClick={handleDownload} disabled={isGenerating}>
			{isGenerating ? "Generating..." : "Download Work Order"}
		</Button>
	);
}
