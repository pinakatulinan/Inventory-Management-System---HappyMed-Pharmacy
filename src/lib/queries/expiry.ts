import "server-only";

import { prisma } from "@/lib/db";
import {
  assessExpiry,
  type ExpiryAssessment,
  type ExpiryStatus,
} from "@/lib/expiry";
import type { AppSettings } from "@/lib/settings";

/**
 * Expiry reporting.
 *
 * The date arithmetic runs in Postgres against the `expiryDate` indexes rather
 * than by loading batches into Node and filtering there - the difference stops
 * mattering at a few thousand batches, which a pharmacy reaches quickly.
 */

export interface ExpirySummary {
  expired: number;
  critical: number;
  warning: number;
  ok: number;
  /** Batches needing attention now: expired + critical. */
  needsAttention: number;
  /** Acquisition cost of expired and critical stock still on the shelf. */
  valueAtRisk: number;
}

export async function getExpirySummary(
  settings: AppSettings,
): Promise<ExpirySummary> {
  const { todayDate, expiry } = settings;

  const [row] = await prisma.$queryRaw<
    {
      expired: number;
      critical: number;
      warning: number;
      ok: number;
      valueAtRisk: string | null;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (
        WHERE "expiryDate" < ${todayDate}::date
      )::int AS "expired",
      COUNT(*) FILTER (
        WHERE "expiryDate" >= ${todayDate}::date
          AND "expiryDate" <= ${todayDate}::date + ${expiry.criticalDays}::int
      )::int AS "critical",
      COUNT(*) FILTER (
        WHERE "expiryDate" > ${todayDate}::date + ${expiry.criticalDays}::int
          AND "expiryDate" <= ${todayDate}::date + ${expiry.warningDays}::int
      )::int AS "warning",
      COUNT(*) FILTER (
        WHERE "expiryDate" > ${todayDate}::date + ${expiry.warningDays}::int
      )::int AS "ok",
      COALESCE(SUM("quantityOnHand" * "costPerUnit") FILTER (
        WHERE "expiryDate" <= ${todayDate}::date + ${expiry.criticalDays}::int
      ), 0) AS "valueAtRisk"
    FROM "Batch"
    WHERE "quantityOnHand" > 0
      AND "status"::text IN ('ACTIVE', 'QUARANTINED')
  `;

  const summary = row ?? {
    expired: 0,
    critical: 0,
    warning: 0,
    ok: 0,
    valueAtRisk: "0",
  };

  return {
    expired: summary.expired,
    critical: summary.critical,
    warning: summary.warning,
    ok: summary.ok,
    needsAttention: summary.expired + summary.critical,
    valueAtRisk: Number(summary.valueAtRisk ?? 0),
  };
}

export interface ExpiringBatch {
  id: string;
  lotNumber: string;
  expiryDate: Date;
  quantityOnHand: number;
  status: string;
  productId: string;
  genericName: string;
  brandName: string | null;
  strength: string | null;
  baseUnit: string;
  packUnit: string | null;
  unitsPerPack: number;
  costPerUnit: string;
  categoryName: string;
  supplierName: string | null;
  assessment: ExpiryAssessment;
}

/**
 * Batches at or inside the warning window, soonest-expiring first.
 * Expired batches sort to the top because they are the ones that must come off
 * the shelf today.
 */
export async function getExpiringBatches(
  settings: AppSettings,
  options: { limit?: number; withinDays?: number } = {},
): Promise<ExpiringBatch[]> {
  const withinDays = options.withinDays ?? settings.expiry.warningDays;
  const limit = options.limit ?? 100;

  const rows = await prisma.batch.findMany({
    where: {
      quantityOnHand: { gt: 0 },
      status: { in: ["ACTIVE", "QUARANTINED"] },
      expiryDate: {
        lte: new Date(settings.todayDate.getTime() + withinDays * 86_400_000),
      },
    },
    orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      lotNumber: true,
      expiryDate: true,
      quantityOnHand: true,
      status: true,
      costPerUnit: true,
      productId: true,
      product: {
        select: {
          genericName: true,
          brandName: true,
          strength: true,
          baseUnit: true,
          packUnit: true,
          unitsPerPack: true,
          category: { select: { name: true } },
          supplier: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((batch) => ({
    id: batch.id,
    lotNumber: batch.lotNumber,
    expiryDate: batch.expiryDate,
    quantityOnHand: batch.quantityOnHand,
    status: batch.status,
    productId: batch.productId,
    genericName: batch.product.genericName,
    brandName: batch.product.brandName,
    strength: batch.product.strength,
    baseUnit: batch.product.baseUnit,
    packUnit: batch.product.packUnit,
    unitsPerPack: batch.product.unitsPerPack,
    costPerUnit: batch.costPerUnit.toString(),
    categoryName: batch.product.category.name,
    supplierName: batch.product.supplier?.name ?? null,
    assessment: assessExpiry(
      batch.expiryDate,
      settings.todayEpochDay,
      settings.expiry,
    ),
  }));
}

/** Convenience for the sidebar badge: how many batches need attention now. */
export async function countBatchesNeedingAttention(
  settings: AppSettings,
): Promise<number> {
  return prisma.batch.count({
    where: {
      quantityOnHand: { gt: 0 },
      status: { in: ["ACTIVE", "QUARANTINED"] },
      expiryDate: {
        lte: new Date(
          settings.todayDate.getTime() +
            settings.expiry.criticalDays * 86_400_000,
        ),
      },
    },
  });
}

/** Group counts keyed by status, for the dashboard tiles. */
export function summaryByStatus(
  summary: ExpirySummary,
): Record<ExpiryStatus, number> {
  return {
    EXPIRED: summary.expired,
    CRITICAL: summary.critical,
    WARNING: summary.warning,
    OK: summary.ok,
  };
}
