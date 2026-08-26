import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { OrderBuilder, type SuggestedLine } from "@/app/(app)/purchase-orders/order-builder";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getLowStockProducts } from "@/lib/queries/dashboard";
import { getPickerProducts } from "@/lib/queries/picker";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New purchase order" };
export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  await requirePermission("po.manage");

  const [settings, products, suppliers, lowStock, { supplier }] =
    await Promise.all([
      getSettings(),
      getPickerProducts({ withStock: true }),
      prisma.supplier.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      getLowStockProducts(30),
      searchParams,
    ]);

  // Suggest the most recent cost we actually paid, so the buyer starts from a
  // real number rather than zero.
  const lastCosts = await prisma.batch.findMany({
    where: { productId: { in: lowStock.map((p) => p.id) } },
    orderBy: { receivedDate: "desc" },
    distinct: ["productId"],
    select: { productId: true, costPerUnit: true },
  });
  const costBy = new Map(lastCosts.map((b) => [b.productId, b.costPerUnit.toString()]));

  const suggestions: SuggestedLine[] = lowStock.map((p) => ({
    productId: p.id,
    shortfall: Math.max(1, p.reorderPoint - p.onHand),
    lastCost: costBy.get(p.id) ?? null,
  }));

  return (
    <>
      <Link
        href="/purchase-orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All purchase orders
      </Link>

      <PageHeader
        title="New purchase order"
        description="Draft an order. Stock is only added to the shelf when the delivery is received against it."
      />

      <div className="max-w-4xl">
        <OrderBuilder
          products={products}
          suppliers={suppliers}
          currency={settings.currency}
          locale={settings.locale}
          suggestions={suggestions}
          defaultSupplierId={supplier}
        />
      </div>
    </>
  );
}
