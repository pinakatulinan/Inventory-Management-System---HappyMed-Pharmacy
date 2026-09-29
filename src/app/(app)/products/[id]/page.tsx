import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Pencil, Snowflake, Wallet } from "lucide-react";

import {
  DOSAGE_FORM_LABELS,
  ITEM_TYPE_LABELS,
} from "@/app/(app)/products/product-form";
import {
  DataTable,
  TableBody,
  TableCard,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/data-table/table";
import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge, StockBadge } from "@/components/expiry-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { BATCH_STATUS_META } from "@/lib/batch-status";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { formatCivilDate, formatInstant } from "@/lib/dates";
import { assessExpiry, classifyStock } from "@/lib/expiry";
import { MOVEMENT_LABELS } from "@/lib/queries/dashboard";
import { getProductDetail, getProductMovements } from "@/lib/queries/products";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatQuantity, formatUnitPrice, toNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductDetail(id);
  return {
    title: product ? (product.brandName ?? product.genericName) : "Product",
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("inventory.view");
  const settings = await getSettings();
  const { id } = await params;

  const product = await getProductDetail(id);
  if (!product) notFound();

  const movements = await getProductMovements(id);
  const canManage = can(user.role, "catalogue.manage");

  const packSpec = {
    baseUnit: product.baseUnit,
    packUnit: product.packUnit,
    unitsPerPack: product.unitsPerPack,
  };

  const activeBatches = product.batches.filter((b) => b.status === "ACTIVE");
  const onHand = activeBatches.reduce((n, b) => n + b.quantityOnHand, 0);
  const stockValue = product.batches
    .filter((b) => b.status === "ACTIVE" || b.status === "QUARANTINED")
    .reduce((sum, b) => sum + b.quantityOnHand * toNumber(b.costPerUnit), 0);

  // Only batches holding stock are worth showing on the shelf view; depleted
  // ones stay reachable through the movement history below.
  const visibleBatches = product.batches.filter(
    (b) => b.quantityOnHand > 0 || b.status === "ACTIVE",
  );

  const stockStatus = classifyStock(onHand, product.reorderPoint);
  const label = product.brandName ?? product.genericName;

  return (
    <>
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All items
      </Link>

      <PageHeader
        title={label}
        description={[
          product.genericName,
          product.strength,
          product.itemType === "MEDICINE"
            ? DOSAGE_FORM_LABELS[product.dosageForm]
            : ITEM_TYPE_LABELS[product.itemType],
          product.category.name,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          canManage ? (
            <Button asChild variant="outline">
              <Link href={`/products/${product.id}/edit`}>
                <Pencil aria-hidden />
                Edit
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="rounded-full border bg-muted px-2.5 py-0.5 font-mono text-xs">
          {product.sku}
        </span>
        <StockBadge status={stockStatus} />
        {product.isRxOnly ? (
          <span className="rounded-full border border-status-warning-border bg-status-warning-soft px-2.5 py-0.5 text-xs font-medium text-status-warning">
            Prescription only
          </span>
        ) : null}
        {product.requiresRefrigeration ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800">
            <Snowflake className="size-3" aria-hidden />
            Refrigerate
          </span>
        ) : null}
        {!product.isActive ? (
          <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Discontinued
          </span>
        ) : null}
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Dispensable stock"
          value={formatQuantity(onHand, packSpec)}
          hint={`Reorder point: ${product.reorderPoint} ${product.baseUnit}`}
          tone={stockStatus === "OK" ? "ok" : stockStatus === "LOW" ? "warning" : "expired"}
          icon={<Boxes className="size-4" />}
        />
        <StatCard
          label="Active batches"
          value={activeBatches.length}
          hint={`${product.batches.length} in total, including past ones`}
        />
        <StatCard
          label="Stock value at cost"
          value={formatMoney(stockValue, settings.currency, settings.locale)}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Selling price"
          value={formatUnitPrice(product.sellingPrice, settings.currency, settings.locale)}
          hint={`per ${product.baseUnit}${
            product.packUnit
              ? ` · ${formatMoney(
                  toNumber(product.sellingPrice) * product.unitsPerPack,
                  settings.currency,
                  settings.locale,
                )} per ${product.packUnit}`
              : ""
          }`}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TableCard
            toolbar={
              <div>
                <h2 className="text-sm font-semibold">Batches</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Each lot with its own expiry date, soonest first
                </p>
              </div>
            }
          >
            {visibleBatches.length === 0 ? (
              <EmptyState
                icon={<Boxes className="size-5" />}
                title="No stock on hand"
                description="Record a delivery to open the first batch."
                action={
                  can(user.role, "stock.receive") ? (
                    <Button asChild size="sm">
                      <Link href={`/receive?product=${product.id}`}>
                        Receive stock
                      </Link>
                    </Button>
                  ) : null
                }
              />
            ) : (
              <DataTable caption="Batches of this product">
                <TableHead>
                  <Th>Lot</Th>
                  <Th>Expires</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Cost</Th>
                  <Th>Status</Th>
                </TableHead>

                <TableBody>
                  {visibleBatches.map((batch) => {
                    const expiry = assessExpiry(
                      batch.expiryDate,
                      settings.todayEpochDay,
                      settings.expiry,
                    );
                    const statusMeta = BATCH_STATUS_META[batch.status];

                    return (
                      <Tr key={batch.id}>
                        <Td className="font-mono text-xs">
                          {batch.lotNumber}
                          <p className="font-sans text-xs text-muted-foreground">
                            in {formatCivilDate(batch.receivedDate, settings.locale)}
                          </p>
                        </Td>

                        <Td>
                          <span className="whitespace-nowrap tabular">
                            {formatCivilDate(batch.expiryDate, settings.locale)}
                          </span>
                          <div className="mt-1">
                            <ExpiryBadge
                              status={expiry.status}
                              daysLeft={expiry.daysLeft}
                            />
                          </div>
                        </Td>

                        <Td align="right" className="tabular">
                          {batch.quantityOnHand}
                          <p className="text-xs text-muted-foreground">
                            of {batch.quantityReceived} received
                          </p>
                        </Td>

                        <Td align="right" className="tabular">
                          {formatUnitPrice(
                            batch.costPerUnit,
                            settings.currency,
                            settings.locale,
                          )}
                        </Td>

                        <Td>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                              statusMeta.className,
                            )}
                          >
                            {statusMeta.label}
                          </span>
                        </Td>
                      </Tr>
                    );
                  })}
                </TableBody>
              </DataTable>
            )}
          </TableCard>
        </div>

        <section className="rounded-xl border bg-card shadow-xs">
          <header className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Movement history</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every change to this product&apos;s stock
            </p>
          </header>

          {movements.length === 0 ? (
            <EmptyState title="No movements yet" />
          ) : (
            <ul className="max-h-[32rem] divide-y overflow-y-auto">
              {movements.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      {MOVEMENT_LABELS[m.type]}{" "}
                      <span
                        className={cn(
                          "tabular",
                          m.quantity > 0 ? "text-status-ok" : "text-muted-foreground",
                        )}
                      >
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </span>
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground tabular">
                      &rarr; {m.balanceAfter}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{m.batch.lotNumber}</span>
                    {" · "}
                    {m.user.name}
                    {" · "}
                    {formatInstant(m.createdAt, settings.timeZone, settings.locale)}
                  </p>
                  {m.reason ? (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      {m.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
