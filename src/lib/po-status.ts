import type { PurchaseOrderStatus } from "@/generated/prisma/enums";

export const PO_STATUS_META: Record<
  PurchaseOrderStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className: "border-border bg-muted text-muted-foreground",
  },
  SUBMITTED: {
    label: "Submitted",
    className: "border-brand-200 bg-brand-50 text-brand-800",
  },
  PARTIALLY_RECEIVED: {
    label: "Part received",
    className:
      "border-status-warning-border bg-status-warning-soft text-status-warning",
  },
  RECEIVED: {
    label: "Received",
    className: "border-status-ok-border bg-status-ok-soft text-status-ok",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "border-border bg-muted text-muted-foreground line-through",
  },
};
