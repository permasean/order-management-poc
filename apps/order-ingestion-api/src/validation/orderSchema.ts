import { z } from "zod";

export const createOrderSchema = z.object({
  ticketId: z.string().min(1, "ticketId is required"),
  siteAddress: z.string().min(1, "siteAddress is required"),
  scheduledDateTime: z.string().datetime({
    message: "scheduledDateTime must be a valid ISO 8601 string",
  }),
  dispatchType: z.enum(["New Install", "Repair", "Site Survey"], {
    errorMap: () => ({
      message:
        "dispatchType must be one of: New Install, Repair, Site Survey",
    }),
  }),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
