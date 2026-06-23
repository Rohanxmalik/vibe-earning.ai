import { z } from "zod";

/**
 * A developer's payout destination. UPI needs a VPA; bank needs account+IFSC.
 * The server verifies (KYC) before it's usable for a real payout.
 */
export const payoutDestinationSchema = z
  .object({
    method: z.enum(["upi", "bank"]),
    vpa: z.string().min(3).optional(),
    accountNumber: z.string().min(5).optional(),
    ifsc: z.string().min(4).optional(),
  })
  .refine((d) => (d.method === "upi" ? !!d.vpa : !!d.accountNumber && !!d.ifsc), {
    message: "upi requires vpa; bank requires accountNumber and ifsc",
  });

export type PayoutDestinationInput = z.infer<typeof payoutDestinationSchema>;
