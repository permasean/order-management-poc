import { task, wait, logger, retry } from "@trigger.dev/sdk/v3";
import { prisma, OrderStatus } from "@repo/database";

const VENDOR_API_URL = process.env.VENDOR_API_URL ?? "http://localhost:3003";
const MAX_POLLS = 3;
const POLL_INTERVAL_SECONDS = 30;

export const orderLifecycle = task({
	id: "order-lifecycle",
	maxDuration: 86400,
	queue: { concurrencyLimit: 10 },
	run: async (payload: { orderId: string }) => {
		const { orderId } = payload;

		logger.info(`Workflow started for order ${orderId}, waiting for approval`);

		const token = await wait.createToken({
			idempotencyKey: `approval:${orderId}`,
			timeout: "24h", // should be indefinite or definite? if definite, what is a good timeout range?
			tags: [`order:${orderId}`],
		});

		const approval = await wait.forToken<{ vendorName: string }>(token);

		if (!approval.ok) {
			throw new Error(`Approval wait failed for order ${orderId}`);
		}

		const { vendorName } = approval.output;

		await prisma.order.update({
			where: { id: orderId },
			data: {
				status: OrderStatus.REQUEST_SENT,
				vendorName,
			},
		});

		logger.info(`Order ${orderId} approved by ${vendorName}, calling vendor API`);

		const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

		const response = await retry.fetch(`${VENDOR_API_URL}/dispatch`, {
			method: "POST",
			headers: { "Content-Type": "application/json" }, // insert bearer token here if auth required
			body: JSON.stringify({
				orderId,
				dispatchType: order.dispatchType,
				siteAddress: order.siteAddress,
			}),
			retry: {
				timeout: {
					maxAttempts: 3,
					minTimeoutInMs: 1000,
					maxTimeoutInMs: 10000,
					factor: 2,
				},
			},
		});

		if (!response.ok) {
			throw new Error(`Vendor API returned ${response.status}`);
		}

		const { vendorOrderNumber } = await response.json() as { vendorOrderNumber: string };

		await prisma.order.update({
			where: { id: orderId },
			data: { vendorOrderNumber },
		});

		logger.info(`VON ${vendorOrderNumber} stored for order ${orderId}, polling for tech assignment`);

		let polls = 0;

		while (polls < MAX_POLLS) {
			await wait.for({ seconds: POLL_INTERVAL_SECONDS });

			const techResponse = await fetch(`${VENDOR_API_URL}/dispatch/${vendorOrderNumber}`);
			const techData = await techResponse.json() as {
				status: string;
				techFirstName?: string;
				techLastName?: string;
				techMobilePhone?: string;
			};

			if (techData.status === "assigned") {
				await prisma.order.update({
					where: { id: orderId },
					data: {
						status: OrderStatus.CONFIRMED,
						techFirstName: techData.techFirstName,
						techLastName: techData.techLastName,
						techMobilePhone: techData.techMobilePhone,
					},
				});

				logger.info(`Order ${orderId} confirmed, tech assigned: ${techData.techFirstName} ${techData.techLastName}`);
				return { orderId, vendorOrderNumber, status: "CONFIRMED" };
			}

			polls++;
			logger.info(`Poll ${polls}/${MAX_POLLS} for order ${orderId}: tech not yet assigned`);
		}

		throw new Error(`Tech assignment polling exceeded ${MAX_POLLS} attempts for order ${orderId}`);
	},
	onFailure: async ({ payload, error }) => {
		logger.error(`Workflow failed for order ${payload.orderId}`, { error });

		// any failures marks the order status as FAILED - this is probably a behavior we don't want.
		// need to expand on what happens here.
		await prisma.order.update({
			where: { id: payload.orderId },
			data: { status: OrderStatus.FAILED },
		});
	},
});
