/**
 * Expiry classification.
 *
 * Expiry status is never persisted - it is derived from a batch expiry date and
 * the current calendar date every time it is needed. A stored status column
 * would be wrong the moment the clock passes midnight.
 *
 * Everything here is a pure function so the same rules run in Server
 * Components, in the cron job and in the browser without drifting apart.
 */

export type ExpiryStatus = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";

export interface ExpiryThresholds {
  /** Days until expiry at or below which a batch is CRITICAL. */
  criticalDays: number;
  /** Days until expiry at or below which a batch is a WARNING. */
  warningDays: number;
}

export const DEFAULT_EXPIRY_THRESHOLDS: ExpiryThresholds = {
  criticalDays: 30,
  warningDays: 90,
};

/**
 * Days since the Unix epoch for the calendar date only, time of day discarded.
 *
 * Batch.expiryDate is a Postgres `date`, which Prisma hands back as a Date at
 * UTC midnight. Reading it with UTC accessors keeps the calendar date intact
 * regardless of the server timezone.
 */
export function toEpochDay(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );
}

/**
 * Today's calendar date in the pharmacy's timezone, as an epoch day.
 *
 * This matters: a batch expiring "today" must change status at midnight where
 * the pharmacy actually is, not at midnight UTC on the server.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): number {
  // en-CA formats as YYYY-MM-DD, which parses unambiguously.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Whole days from today until the batch expires.
 * Negative means already expired, 0 means it expires today.
 */
export function daysUntilExpiry(expiryDate: Date, todayEpochDay: number): number {
  return toEpochDay(expiryDate) - todayEpochDay;
}

export function classifyExpiry(
  daysLeft: number,
  thresholds: ExpiryThresholds = DEFAULT_EXPIRY_THRESHOLDS,
): ExpiryStatus {
  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft <= thresholds.criticalDays) return "CRITICAL";
  if (daysLeft <= thresholds.warningDays) return "WARNING";
  return "OK";
}

export interface ExpiryAssessment {
  status: ExpiryStatus;
  daysLeft: number;
}

export function assessExpiry(
  expiryDate: Date,
  todayEpochDay: number,
  thresholds: ExpiryThresholds = DEFAULT_EXPIRY_THRESHOLDS,
): ExpiryAssessment {
  const daysLeft = daysUntilExpiry(expiryDate, todayEpochDay);
  return { status: classifyExpiry(daysLeft, thresholds), daysLeft };
}

/** Presentation metadata. Severity is descending, so it sorts urgent-first. */
export const EXPIRY_STATUS_META: Record<
  ExpiryStatus,
  { label: string; severity: number; badgeClass: string; dotClass: string }
> = {
  EXPIRED: {
    label: "Expired",
    severity: 3,
    badgeClass:
      "bg-status-expired-soft text-status-expired border-status-expired-border",
    dotClass: "bg-status-expired",
  },
  CRITICAL: {
    label: "Critical",
    severity: 2,
    badgeClass:
      "bg-status-critical-soft text-status-critical border-status-critical-border",
    dotClass: "bg-status-critical",
  },
  WARNING: {
    label: "Warning",
    severity: 1,
    badgeClass:
      "bg-status-warning-soft text-status-warning border-status-warning-border",
    dotClass: "bg-status-warning",
  },
  OK: {
    label: "Good",
    severity: 0,
    badgeClass: "bg-status-ok-soft text-status-ok border-status-ok-border",
    dotClass: "bg-status-ok",
  },
};

/** Human phrasing for the countdown, e.g. "expired 4 days ago", "in 12 days". */
export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft < -1) return `expired ${Math.abs(daysLeft)} days ago`;
  if (daysLeft === -1) return "expired yesterday";
  if (daysLeft === 0) return "expires today";
  if (daysLeft === 1) return "expires tomorrow";
  return `in ${daysLeft} days`;
}

// ---------------------------------------------------------------------------
// Stock level (separate axis from expiry - a batch can be fresh but empty)
// ---------------------------------------------------------------------------

export type StockStatus = "OUT_OF_STOCK" | "LOW" | "OK";

export function classifyStock(
  quantityOnHand: number,
  reorderPoint: number,
): StockStatus {
  if (quantityOnHand <= 0) return "OUT_OF_STOCK";
  if (quantityOnHand <= reorderPoint) return "LOW";
  return "OK";
}

export const STOCK_STATUS_META: Record<
  StockStatus,
  { label: string; badgeClass: string }
> = {
  OUT_OF_STOCK: {
    label: "Out of stock",
    badgeClass:
      "bg-status-expired-soft text-status-expired border-status-expired-border",
  },
  LOW: {
    label: "Low stock",
    badgeClass:
      "bg-status-critical-soft text-status-critical border-status-critical-border",
  },
  OK: {
    label: "In stock",
    badgeClass: "bg-status-ok-soft text-status-ok border-status-ok-border",
  },
};
