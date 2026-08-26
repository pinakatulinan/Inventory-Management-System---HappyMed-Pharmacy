import "server-only";

import type { MovementType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * Reporting queries.
 *
 * All of these aggregate in Postgres rather than in Node. A stock valuation
 * that loads every batch to sum it in JavaScript works fine on seed data and
 * falls over on a real catalogue after a year of trading.
 */

export interface ValuationRow {
  name: string;
  products: number;
  batches: number;
  units: number;
  costValue: number;
  retailValue: number;
}

/** Stock value at cost and at retail, grouped by category or supplier. */
export async function getValuation(
  by: "category" | "supplier",
): Promise<ValuationRow[]> {
  const rows =
    by === "category"
      ? await prisma.$queryRaw<
          {
            name: string;
            products: number;
            batches: number;
            units: number;
            costValue: string;
            retailValue: string;
          }[]
        >`
          SELECT c."name" AS "name",
                 COUNT(DISTINCT p."id")::int AS "products",
                 COUNT(b."id")::int AS "batches",
                 COALESCE(SUM(b."quantityOnHand"), 0)::int AS "units",
                 COALESCE(SUM(b."quantityOnHand" * b."costPerUnit"), 0) AS "costValue",
                 COALESCE(SUM(b."quantityOnHand" * p."sellingPrice"), 0) AS "retailValue"
            FROM "Category" c
            JOIN "Product" p ON p."categoryId" = c."id"
            JOIN "Batch" b ON b."productId" = p."id"
                          AND b."status"::text = 'ACTIVE'
                          AND b."quantityOnHand" > 0
           GROUP BY c."name"
           ORDER BY "costValue" DESC
        `
      : await prisma.$queryRaw<
          {
            name: string;
            products: number;
            batches: number;
            units: number;
            costValue: string;
            retailValue: string;
          }[]
        >`
          SELECT COALESCE(s."name", 'No supplier set') AS "name",
                 COUNT(DISTINCT p."id")::int AS "products",
                 COUNT(b."id")::int AS "batches",
                 COALESCE(SUM(b."quantityOnHand"), 0)::int AS "units",
                 COALESCE(SUM(b."quantityOnHand" * b."costPerUnit"), 0) AS "costValue",
                 COALESCE(SUM(b."quantityOnHand" * p."sellingPrice"), 0) AS "retailValue"
            FROM "Product" p
            LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
            JOIN "Batch" b ON b."productId" = p."id"
                          AND b."status"::text = 'ACTIVE'
                          AND b."quantityOnHand" > 0
           GROUP BY COALESCE(s."name", 'No supplier set')
           ORDER BY "costValue" DESC
        `;

  return rows.map((r) => ({
    name: r.name,
    products: r.products,
    batches: r.batches,
    units: r.units,
    costValue: Number(r.costValue),
    retailValue: Number(r.retailValue),
  }));
}

export interface WastageRow {
  productId: string;
  genericName: string;
  brandName: string | null;
  baseUnit: string;
  units: number;
  costValue: number;
  events: number;
}

/**
 * What was written off in the period, and what it cost.
 *
 * Costed at the batch's own acquisition cost rather than a current average, so
 * the figure reflects money actually spent on stock that was thrown away.
 */
export async function getWastage(
  from: Date,
  to: Date,
): Promise<WastageRow[]> {
  const rows = await prisma.$queryRaw<
    {
      productId: string;
      genericName: string;
      brandName: string | null;
      baseUnit: string;
      units: number;
      costValue: string;
      events: number;
    }[]
  >`
    SELECT p."id" AS "productId",
           p."genericName",
           p."brandName",
           p."baseUnit",
           COALESCE(SUM(-m."quantity"), 0)::int AS "units",
           COALESCE(SUM(-m."quantity" * b."costPerUnit"), 0) AS "costValue",
           COUNT(*)::int AS "events"
      FROM "StockMovement" m
      JOIN "Batch" b ON b."id" = m."batchId"
      JOIN "Product" p ON p."id" = m."productId"
     WHERE m."type"::text = 'DISPOSAL'
       AND m."createdAt" >= ${from}
       AND m."createdAt" < ${to}
     GROUP BY p."id", p."genericName", p."brandName", p."baseUnit"
     ORDER BY "costValue" DESC
     LIMIT 50
  `;

  return rows.map((r) => ({
    ...r,
    costValue: Number(r.costValue),
  }));
}

export interface MovementSummaryRow {
  type: MovementType;
  events: number;
  units: number;
}

export async function getMovementSummary(
  from: Date,
  to: Date,
): Promise<MovementSummaryRow[]> {
  const rows = await prisma.$queryRaw<
    { type: MovementType; events: number; units: number }[]
  >`
    SELECT m."type"::text AS "type",
           COUNT(*)::int AS "events",
           COALESCE(SUM(ABS(m."quantity")), 0)::int AS "units"
      FROM "StockMovement" m
     WHERE m."createdAt" >= ${from}
       AND m."createdAt" < ${to}
     GROUP BY m."type"
     ORDER BY "units" DESC
  `;

  return rows;
}

export interface SlowMoverRow {
  productId: string;
  genericName: string;
  brandName: string | null;
  baseUnit: string;
  onHand: number;
  costValue: number;
  dispensedInPeriod: number;
  nearestExpiry: Date | null;
}

/**
 * Stock that is sitting still.
 *
 * These are the items most likely to expire before they sell, which is exactly
 * the loss this system exists to prevent, so they are ranked by value at risk
 * rather than by quantity.
 */
export async function getSlowMovers(
  from: Date,
  to: Date,
  limit = 20,
): Promise<SlowMoverRow[]> {
  const rows = await prisma.$queryRaw<
    {
      productId: string;
      genericName: string;
      brandName: string | null;
      baseUnit: string;
      onHand: number;
      costValue: string;
      dispensedInPeriod: number;
      nearestExpiry: Date | null;
    }[]
  >`
    SELECT p."id" AS "productId",
           p."genericName",
           p."brandName",
           p."baseUnit",
           COALESCE(SUM(b."quantityOnHand"), 0)::int AS "onHand",
           COALESCE(SUM(b."quantityOnHand" * b."costPerUnit"), 0) AS "costValue",
           COALESCE((
             SELECT SUM(-m."quantity")::int
               FROM "StockMovement" m
              WHERE m."productId" = p."id"
                AND m."type"::text = 'DISPENSE'
                AND m."createdAt" >= ${from}
                AND m."createdAt" < ${to}
           ), 0) AS "dispensedInPeriod",
           MIN(b."expiryDate") AS "nearestExpiry"
      FROM "Product" p
      JOIN "Batch" b ON b."productId" = p."id"
                    AND b."status"::text = 'ACTIVE'
                    AND b."quantityOnHand" > 0
     WHERE p."isActive" = true
     GROUP BY p."id", p."genericName", p."brandName", p."baseUnit"
    HAVING COALESCE((
             SELECT SUM(-m."quantity")::int
               FROM "StockMovement" m
              WHERE m."productId" = p."id"
                AND m."type"::text = 'DISPENSE'
                AND m."createdAt" >= ${from}
                AND m."createdAt" < ${to}
           ), 0) = 0
     ORDER BY "costValue" DESC
     LIMIT ${limit}
  `;

  return rows.map((r) => ({ ...r, costValue: Number(r.costValue) }));
}
