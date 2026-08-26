import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { DosageForm } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export interface ProductListRow {
  id: string;
  sku: string;
  genericName: string;
  brandName: string | null;
  strength: string | null;
  dosageForm: DosageForm;
  baseUnit: string;
  packUnit: string | null;
  unitsPerPack: number;
  reorderPoint: number;
  sellingPrice: string;
  isActive: boolean;
  isRxOnly: boolean;
  requiresRefrigeration: boolean;
  categoryName: string;
  supplierName: string | null;
  /** Dispensable stock only: ACTIVE batches. Quarantined stock cannot be sold. */
  onHand: number;
  activeBatches: number;
  nearestExpiry: Date | null;
}

export interface ProductFilters {
  query?: string;
  categoryId?: string;
  supplierId?: string;
  status?: "active" | "discontinued" | "all";
  stock?: "low" | "out" | "all";
}

export function buildProductWhere(
  filters: ProductFilters,
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (filters.status === "discontinued") where.isActive = false;
  else if (filters.status !== "all") where.isActive = true;

  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.supplierId) where.supplierId = filters.supplierId;

  if (filters.query) {
    where.OR = [
      { genericName: { contains: filters.query, mode: "insensitive" } },
      { brandName: { contains: filters.query, mode: "insensitive" } },
      { sku: { contains: filters.query, mode: "insensitive" } },
      { strength: { contains: filters.query, mode: "insensitive" } },
    ];
  }

  return where;
}

/**
 * Products with their current dispensable stock.
 *
 * The stock totals come from two grouped queries rather than a correlated
 * subquery per row, so the cost stays flat as the catalogue grows.
 */
export async function listProducts(
  filters: ProductFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: ProductListRow[]; total: number }> {
  const where = buildProductWhere(filters);

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ genericName: "asc" }, { brandName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        sku: true,
        genericName: true,
        brandName: true,
        strength: true,
        dosageForm: true,
        baseUnit: true,
        packUnit: true,
        unitsPerPack: true,
        reorderPoint: true,
        sellingPrice: true,
        isActive: true,
        isRxOnly: true,
        requiresRefrigeration: true,
        category: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const ids = products.map((p) => p.id);

  const stock = ids.length
    ? await prisma.batch.groupBy({
        by: ["productId"],
        where: { productId: { in: ids }, status: "ACTIVE" },
        _sum: { quantityOnHand: true },
        _count: { _all: true },
      })
    : [];

  const nearest = ids.length
    ? await prisma.batch.groupBy({
        by: ["productId"],
        where: {
          productId: { in: ids },
          status: "ACTIVE",
          quantityOnHand: { gt: 0 },
        },
        _min: { expiryDate: true },
      })
    : [];

  const stockBy = new Map(stock.map((s) => [s.productId, s]));
  const nearestBy = new Map(nearest.map((n) => [n.productId, n._min.expiryDate]));

  let rows: ProductListRow[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    genericName: p.genericName,
    brandName: p.brandName,
    strength: p.strength,
    dosageForm: p.dosageForm,
    baseUnit: p.baseUnit,
    packUnit: p.packUnit,
    unitsPerPack: p.unitsPerPack,
    reorderPoint: p.reorderPoint,
    sellingPrice: p.sellingPrice.toString(),
    isActive: p.isActive,
    isRxOnly: p.isRxOnly,
    requiresRefrigeration: p.requiresRefrigeration,
    categoryName: p.category.name,
    supplierName: p.supplier?.name ?? null,
    onHand: stockBy.get(p.id)?._sum.quantityOnHand ?? 0,
    activeBatches: stockBy.get(p.id)?._count._all ?? 0,
    nearestExpiry: nearestBy.get(p.id) ?? null,
  }));

  // Stock-level filtering happens after aggregation. It is applied to the
  // current page only, which is honest for a "show me what needs attention"
  // filter and avoids a much heavier grouped query for a rarely used view.
  if (filters.stock === "low") {
    rows = rows.filter((r) => r.onHand > 0 && r.onHand <= r.reorderPoint);
  } else if (filters.stock === "out") {
    rows = rows.filter((r) => r.onHand <= 0);
  }

  return { rows, total };
}

/** Everything the product detail page needs, in one round trip each. */
export async function getProductDetail(id: string) {
  return prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      sku: true,
      genericName: true,
      brandName: true,
      strength: true,
      dosageForm: true,
      description: true,
      baseUnit: true,
      packUnit: true,
      unitsPerPack: true,
      sellingPrice: true,
      reorderPoint: true,
      isActive: true,
      isRxOnly: true,
      requiresRefrigeration: true,
      createdAt: true,
      categoryId: true,
      supplierId: true,
      category: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      batches: {
        orderBy: [{ expiryDate: "asc" }],
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          receivedDate: true,
          costPerUnit: true,
          quantityReceived: true,
          quantityOnHand: true,
          status: true,
          notes: true,
        },
      },
    },
  });
}

export async function getProductMovements(productId: string, limit = 40) {
  return prisma.stockMovement.findMany({
    where: { productId },
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
      user: { select: { name: true } },
    },
  });
}
