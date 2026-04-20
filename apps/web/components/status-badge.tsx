import type { OrderStatus } from "@repo/database";
import { Badge } from "@/components/ui/badge";
import { statusColorMap, formatStatus } from "@/lib/order-utils";

export function StatusBadge({ status }: { status: OrderStatus }) {
	return (
		<Badge variant="outline" className={statusColorMap[status]}>
			{formatStatus(status)}
		</Badge>
	);
}
