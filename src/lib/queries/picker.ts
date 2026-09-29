import "server-only";

import type { PickerProduct } from "@/components/form/product-picker";
import { prisma } from "@/lib/db";

/**
 * Active products for the receive and dispense pickers.
 *
 * `withStock` adds the dispensable quantity, which dispensing needs in order to
 * show what is available before someone commits to a number. Receiving does not
 * need it, so it skips the extra aggregation.
 */
export async function getPickerProducts(
  options: { withStock?: boolean } = {},
): Promise<PickerProduct[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ genericName: "asc" }, { brandName: "asc" }],
    select: {
      id: true,
      sku: true,
      genericName: true,
      brandName: true,
      strength: true,
      baseUnit: true,
      packUnit: true,
      unitsPerPack: true,
      isRxOnly: true,
      requiresRefrigeration: true,
    },
  });

  if (!options.withStock) return products;

  const stock = await prisma.batch.groupBy({
    by: ["productId"],
    where: { status: "ACTIVE", quantityOnHand: { gt: 0 } },
    _sum: { quantityOnHand: true },
  });

  const onHandBy = new Map(
    stock.map((s) => [s.productId, s._sum.quantityOnHand ?? 0]),
  );

  return products.map((p) => ({ ...p, onHand: onHandBy.get(p.id) ?? 0 }));
}

/**
 * IDs of products that have been bought before at a real price. The simple
 * receive flow only asks for a cost when a product is not in this set, because
 * otherwise it reuses the last one.
 */
export async function getProductIdsWithKnownCost(): Promise<string[]> {
  const rows = await prisma.batch.groupBy({
    by: ["productId"],
    where: { costPerUnit: { gt: 0 } },
  });
  return rows.map((r) => r.productId);
}
