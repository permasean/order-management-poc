import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { CloseoutForm } from "@/components/closeout-form";
import { CancelButton } from "@/components/cancel-button";
import { ReviewForm } from "@/components/review-form";
import { formatDateTime, formatStatus, isTerminalStatus } from "@/lib/order-utils";

export default async function OrderDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	const order = await prisma.order.findUnique({
		where: { id },
		include: {
			statusHistory: { orderBy: { changedAt: "desc" } },
		},
	});

	if (!order) return notFound();

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link href="/">
					<Button variant="outline">← Back</Button>
				</Link>
				<h1 className="text-2xl font-bold">Order Details</h1>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>Order {order.id.slice(0, 8)}...</CardTitle>
						<StatusBadge status={order.status} />
					</div>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<p className="text-sm text-muted-foreground">Order ID</p>
							<p className="font-mono text-sm">{order.id}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Ticket ID</p>
							<p>{order.ticketId}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Site Address</p>
							<p>{order.siteAddress}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Dispatch Type</p>
							<p>{order.dispatchType.replace("_", " ")}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Scheduled Date/Time</p>
							<p>{formatDateTime(order.scheduledDateTime)}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Last Updated</p>
							<p>{formatDateTime(order.updatedAt)}</p>
						</div>
						{order.vendorName && (
							<div>
								<p className="text-sm text-muted-foreground">Vendor</p>
								<p>{order.vendorName}</p>
							</div>
						)}
						{order.vendorOrderNumber && (
							<div>
								<p className="text-sm text-muted-foreground">Vendor Order Number</p>
								<p className="font-mono">{order.vendorOrderNumber}</p>
							</div>
						)}
						{order.techFirstName && (
							<div>
								<p className="text-sm text-muted-foreground">Technician</p>
								<p>{order.techFirstName} {order.techLastName}</p>
							</div>
						)}
						{order.techMobilePhone && (
							<div>
								<p className="text-sm text-muted-foreground">Tech Phone</p>
								<p>{order.techMobilePhone}</p>
							</div>
						)}
						{order.closeoutNotes && (
							<div className="col-span-2">
								<p className="text-sm text-muted-foreground">Closeout Notes</p>
								<p>{order.closeoutNotes}</p>
							</div>
						)}
						{order.completedAt && (
							<div>
								<p className="text-sm text-muted-foreground">Completed At</p>
								<p>{formatDateTime(order.completedAt)}</p>
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Workflow History</CardTitle>
				</CardHeader>
				<CardContent>
					{order.statusHistory.length === 0 ? (
						<p className="text-muted-foreground text-sm">No status transitions recorded yet.</p>
					) : (
						<div className="space-y-3">
							{order.statusHistory.map((entry) => (
								<div key={entry.id} className="flex items-center gap-3 text-sm">
									<span className="text-muted-foreground w-40 shrink-0">
										{formatDateTime(entry.changedAt)}
									</span>
									<span>
										{entry.fromStatus ? formatStatus(entry.fromStatus) : "Created"}{" → "}
										{formatStatus(entry.toStatus)}
									</span>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{order.status === "MANUAL_REVIEW" && (
			<>
				<Separator />
				<ReviewForm orderId={order.id} />
			</>
		)}

		{order.status === "CONFIRMED" && (
				<>
					<Separator />
					<CloseoutForm orderId={order.id} />
				</>
			)}

			{!isTerminalStatus(order.status) && (
				<>
					<Separator />
					<div className="flex justify-end">
						<CancelButton orderId={order.id} />
					</div>
				</>
			)}
		</div>
	);
}
