import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ProductForm } from "@/app/(app)/products/product-form";
import { DiscontinueProduct } from "@/app/(app)/products/discontinue-product";
import { ExpiryEditor } from "@/app/(app)/products/expiry-editor";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/** Written by the opening-stock import; not a date anyone read off a box. */
const PLACEHOLDER_EXPIRY = "2099-12-31";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("catalogue.manage");
  const settings = await getSettings();
  const { id } = await params;

  const [product, categories, suppliers] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        sku: true,
        genericName: true,
        brandName: true,
        strength: true,
        dosageForm: true,
        description: true,
        categoryId: true,
        supplierId: true,
        baseUnit: true,
        packUnit: true,
        unitsPerPack: true,
        sellingPrice: true,
        reorderPoint: true,
        isRxOnly: true,
        requiresRefrigeration: true,
        isActive: true,
        _count: { select: { batches: true } },
        // Stock still physically present. Disposed and returned boxes are gone,
        // so their dates are history and not editable.
        batches: {
          where: { status: { in: ["ACTIVE", "QUARANTINED", "DEPLETED"] } },
          orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
          select: {
            id: true,
            lotNumber: true,
            expiryDate: true,
            quantityOnHand: true,
            status: true,
          },
        },
      },
    }),
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

  if (!product) notFound();

  const label = product.brandName ?? product.genericName;

  return (
    <>
      <Link
        href={`/products/${product.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to {label}
      </Link>

      <PageHeader title={`Edit ${label}`} />

      <div className="max-w-3xl space-y-6">
        <ProductForm
          product={{
            id: product.id,
            sku: product.sku,
            genericName: product.genericName,
            brandName: product.brandName,
            strength: product.strength,
            dosageForm: product.dosageForm,
            description: product.description,
            categoryId: product.categoryId,
            supplierId: product.supplierId,
            baseUnit: product.baseUnit,
            packUnit: product.packUnit,
            unitsPerPack: product.unitsPerPack,
            sellingPrice: product.sellingPrice.toString(),
            reorderPoint: product.reorderPoint,
            isRxOnly: product.isRxOnly,
            requiresRefrigeration: product.requiresRefrigeration,
            hasStock: product._count.batches > 0,
          }}
          categories={categories}
          suppliers={suppliers}
          currency={settings.currency}
        />

        {can(user.role, "stock.adjust") ? (
          <ExpiryEditor
            baseUnit={product.baseUnit}
            batches={product.batches.map((b) => {
              const iso = b.expiryDate.toISOString().slice(0, 10);
              return {
                id: b.id,
                lotNumber: b.lotNumber,
                expiryDate: iso,
                quantityOnHand: b.quantityOnHand,
                status: b.status,
                unverified: iso === PLACEHOLDER_EXPIRY,
              };
            })}
          />
        ) : null}

        <DiscontinueProduct
          productId={product.id}
          label={label}
          isActive={product.isActive}
        />
      </div>
    </>
  );
}
