import type { BatchStatus } from "@/generated/prisma/enums";

/**
 * Batch lifecycle, for display.
 *
 * QUARANTINED is styled as a warning rather than an error: the stock is real
 * and still on the shelf, it just cannot be dispensed until someone deals with
 * it. DISPOSED and RETURNED are terminal and deliberately muted.
 */
export const BATCH_STATUS_META: Record<
  BatchStatus,
  { label: string; className: string; description: string }
> = {
  ACTIVE: {
    label: "Active",
    className: "border-status-ok-border bg-status-ok-soft text-status-ok",
    description: "Dispensable.",
  },
  QUARANTINED: {
    label: "Quarantined",
    className:
      "border-status-expired-border bg-status-expired-soft text-status-expired",
    description: "Blocked from dispensing. Expired or flagged.",
  },
  DEPLETED: {
    label: "Depleted",
    className: "border-border bg-muted text-muted-foreground",
    description: "Fully dispensed. Kept for history.",
  },
  DISPOSED: {
    label: "Disposed",
    className: "border-border bg-muted text-muted-foreground",
    description: "Written off and destroyed.",
  },
  RETURNED: {
    label: "Returned",
    className: "border-border bg-muted text-muted-foreground",
    description: "Sent back to the supplier.",
  },
};
