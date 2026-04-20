import { Suspense } from "react";
import { prisma, OrderStatus } from "@repo/database";
import { OrdersTable } from "@/components/orders-table";
import { StatusFilter } from "@/components/status-filter";

export default async function HomePage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string }>;
}) {
	const { status } = await searchParams;
	const validStatus = status && Object.values(OrderStatus).includes(status as OrderStatus)
		? (status as OrderStatus)
		: undefined;

	const orders = await prisma.order.findMany({
		where: validStatus ? { status: validStatus } : undefined,
		orderBy: { createdAt: "desc" },
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Orders</h1>
				<Suspense>
					<StatusFilter />
				</Suspense>
			</div>
			<OrdersTable orders={orders} />
		</div>
	);
}
