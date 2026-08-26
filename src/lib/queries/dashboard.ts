import "server-only";

import type { MovementType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export interface InventoryTotals {
  activeProducts: number;
  activeBatches: number;
  /** Acquisition value of everything currently dispensable. */
  stockValue: number;
  outOfStockProducts: number;
  lowStockProducts: number;
}

export async function getInventoryTotals(): Promise<InventoryTotals> {
  const [totals] = await prisma.$queryRaw<
    {
      activeProducts: number;
      activeBatches: number;
      stockValue: string | null;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM "Product" WHERE "isActive" = true) AS "activeProducts",
      (SELECT COUNT(*)::int FROM "Batch"
        WHERE "status"::text = 'ACTIVE' AND "quantityOnHand" > 0) AS "activeBatches",
      (SELECT COALESCE(SUM("quantityOnHand" * "costPerUnit"), 0) FROM "Batch"
        WHERE "status"::text = 'ACTIVE') AS "stockValue"
  `;

  const [stockLevels] = await prisma.$queryRaw<
    { outOfStock: number; low: number }[]
  >`
    WITH "levels" AS (
      SELECT p."id",
             p."reorderPoint",
             COALESCE(SUM(b."quantityOnHand") FILTER (
               WHERE b."status"::text = 'ACTIVE'
             ), 0)::int AS "onHand"
        FROM "Product" p
        LEFT JOIN "Batch" b ON b."productId" = p."id"
       WHERE p."isActive" = true
       GROUP BY p."id", p."reorderPoint"
    )
    SELECT
      COUNT(*) FILTER (WHERE "onHand" <= 0)::int AS "outOfStock",
      COUNT(*) FILTER (WHERE "onHand" > 0 AND "onHand" <= "reorderPoint")::int AS "low"
      FROM "levels"
  `;

  return {
    activeProducts: totals?.activeProducts ?? 0,
    activeBatches: totals?.activeBatches ?? 0,
    stockValue: Number(totals?.stockValue ?? 0),
    outOfStockProducts: stockLevels?.outOfStock ?? 0,
    lowStockProducts: stockLevels?.low ?? 0,
  };
}

export interface LowStockProduct {
  id: string;
  genericName: string;
  brandName: string | null;
  strength: string | null;
  baseUnit: string;
  packUnit: string | null;
  unitsPerPack: number;
  reorderPoint: number;
  onHand: number;
  supplierName: string | null;
}

/**
 * Products at or below their reorder point, emptiest first.
 * Only ACTIVE batches count - quarantined stock cannot be sold, so it must not
 * mask a shortage.
 */
export async function getLowStockProducts(
  limit = 10,
): Promise<LowStockProduct[]> {
  return prisma.$queryRaw<LowStockProduct[]>`
    SELECT p."id",
           p."genericName",
           p."brandName",
           p."strength",
           p."baseUnit",
           p."packUnit",
           p."unitsPerPack",
           p."reorderPoint",
           COALESCE(SUM(b."quantityOnHand") FILTER (
             WHERE b."status"::text = 'ACTIVE'
           ), 0)::int AS "onHand",
           s."name" AS "supplierName"
      FROM "Product" p
      LEFT JOIN "Batch" b ON b."productId" = p."id"
      LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
     WHERE p."isActive" = true
     GROUP BY p."id", s."name"
    HAVING COALESCE(SUM(b."quantityOnHand") FILTER (
             WHERE b."status"::text = 'ACTIVE'
           ), 0)::int <= p."reorderPoint"
     ORDER BY (
       COALESCE(SUM(b."quantityOnHand") FILTER (
         WHERE b."status"::text = 'ACTIVE'
       ), 0)::int - p."reorderPoint"
     ) ASC,
     p."genericName" ASC
     LIMIT ${limit}
  `;
}

export interface RecentMovement {
  id: string;
  type: MovementType;
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: Date;
  lotNumber: string;
  genericName: string;
  brandName: string | null;
  baseUnit: string;
  userName: string;
}

export async function getRecentMovements(
  limit = 8,
): Promise<RecentMovement[]> {
  const rows = await prisma.stockMovement.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      quantity: true,
      balanceAfter: true,
      reason: true,
      createdAt: true,
      batch: { select: { lotNumber: true } },
      product: {
        select: { genericName: true, brandName: true, baseUnit: true },
      },
      user: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    createdAt: row.createdAt,
    lotNumber: row.batch.lotNumber,
    genericName: row.product.genericName,
    brandName: row.product.brandName,
    baseUnit: row.product.baseUnit,
    userName: row.user.name,
  }));
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  RECEIPT: "Received",
  DISPENSE: "Dispensed",
  ADJUSTMENT: "Adjusted",
  DISPOSAL: "Disposed",
  RETURN_TO_SUPPLIER: "Returned",
};
