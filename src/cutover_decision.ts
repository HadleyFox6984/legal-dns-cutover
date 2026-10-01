import { z } from "zod";

export const cutoverRequestSchema = z.object({
  matterId: z.string().min(1),
  domain: z.string().min(1),
  hostname: z.string().min(1),
  target: z.string().min(1),
  recordType: z.enum(["A", "CNAME"]),
  signedDocumentDelivery: z.enum(["delivered", "pending"]),
  filingDeadline: z.string().datetime(),
  action: z.enum(["cutover", "rollback"]).default("cutover"),
  rollbackContent: z.string().min(1).optional()
}).superRefine((value, context) => {
  if (value.action === "rollback" && !value.rollbackContent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rollbackContent"],
      message: "rollbackContent is required for a rollback"
    });
  }
});

export type CutoverRequest = z.infer<typeof cutoverRequestSchema>;

export type CutoverDecision = {
  approved: true;
  effectiveContent: string;
  ttl: number;
  followUpAt: string;
};

export class CutoverRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CutoverRejected";
  }
}

export function decideCutover(input: CutoverRequest, now = new Date()): CutoverDecision {
  if (input.signedDocumentDelivery !== "delivered") {
    throw new CutoverRejected("Signed document delivery must be complete before DNS changes");
  }

  const deadline = new Date(input.filingDeadline);
  const minimumWindowMs = 2 * 60 * 60 * 1000;
  if (deadline.getTime() - now.getTime() < minimumWindowMs) {
    throw new CutoverRejected("The filing deadline is too close for the cutover window");
  }

  return {
    approved: true,
    effectiveContent: input.action === "rollback" ? input.rollbackContent! : input.target,
    ttl: 60,
    followUpAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString()
  };
}
