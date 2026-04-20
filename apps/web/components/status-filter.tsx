"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { OrderStatus } from "@repo/database";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { formatStatus } from "@/lib/order-utils";

const statuses = Object.values(OrderStatus);

export function StatusFilter() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const current = searchParams.get("status") ?? "ALL";

	return (
		<Select
			value={current}
			onValueChange={(v: string | null) => {
				const params = new URLSearchParams(searchParams?.toString() ?? "");
				if (!v || v === "ALL") {
					params.delete("status");
				} else {
					params.set("status", v);
				}
				router.push(`?${params.toString()}`);
			}}
		>
			<SelectTrigger className="w-[200px]">
				{current === "ALL" ? "All Statuses" : formatStatus(current)}
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false}>
				<SelectItem value="ALL">All Statuses</SelectItem>
				{statuses.map((status) => (
					<SelectItem key={status} value={status}>
						{formatStatus(status)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
