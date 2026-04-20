import Link from "next/link";
import type { Order } from "@repo/database";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { formatDateTime } from "@/lib/order-utils";

export function OrdersTable({ orders }: { orders: Order[] }) {
	if (orders.length === 0) {
		return <p className="text-muted-foreground text-center py-8">No orders found.</p>;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Order ID</TableHead>
					<TableHead>Ticket ID</TableHead>
					<TableHead>Site Address</TableHead>
					<TableHead>Dispatch Type</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Scheduled</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{orders.map((order) => (
					<TableRow key={order.id} className="cursor-pointer hover:bg-muted/50">
						<TableCell>
							<Link href={`/orders/${order.id}`} className="underline font-mono text-sm">
								{order.id.slice(0, 8)}...
							</Link>
						</TableCell>
						<TableCell>{order.ticketId}</TableCell>
						<TableCell className="max-w-[200px] truncate">{order.siteAddress}</TableCell>
						<TableCell>{order.dispatchType.replace("_", " ")}</TableCell>
						<TableCell>
							<StatusBadge status={order.status} />
						</TableCell>
						<TableCell>{formatDateTime(order.scheduledDateTime)}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
