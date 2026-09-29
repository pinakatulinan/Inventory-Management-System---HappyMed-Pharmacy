import type { Metadata } from "next";

import { ProductForm } from "@/app/(app)/products/product-form";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New item" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requirePermission("catalogue.manage");
  const settings = await getSettings();

  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="New item"
        description="Add an item to the catalogue. Stock is added separately, when a delivery arrives."
      />

      <div className="max-w-3xl">
        <ProductForm
          categories={categories}
          suppliers={suppliers}
          currency={settings.currency}
        />
      </div>
    </>
  );
}
