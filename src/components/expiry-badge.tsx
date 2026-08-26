import {
  EXPIRY_STATUS_META,
  formatDaysLeft,
  STOCK_STATUS_META,
  type ExpiryStatus,
  type StockStatus,
} from "@/lib/expiry";
import { cn } from "@/lib/utils";

/**
 * Colour alone never carries the message - each badge also states its status in
 * words, so it still reads correctly in a colour-blind or greyscale-printed view.
 */
export function ExpiryBadge({
  status,
  daysLeft,
  className,
}: {
  status: ExpiryStatus;
  daysLeft?: number;
  className?: string;
}) {
  const meta = EXPIRY_STATUS_META[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.badgeClass,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClass)} aria-hidden />
      {meta.label}
      {typeof daysLeft === "number" ? (
        <span className="font-normal opacity-80 tabular">
          &middot; {formatDaysLeft(daysLeft)}
        </span>
      ) : null}
    </span>
  );
}

export function StockBadge({
  status,
  className,
}: {
  status: StockStatus;
  className?: string;
}) {
  const meta = STOCK_STATUS_META[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.badgeClass,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
