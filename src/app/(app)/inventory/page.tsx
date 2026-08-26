import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, PackagePlus } from "lucide-react";

import { BatchRowActions } from "@/app/(app)/inventory/batch-actions";
import { SearchInput } from "@/components/data-table/search-input";
import {
  DataTable,
  Pagination,
  TableBody,
  TableCard,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/data-table/table";
import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import type { BatchStatus } from "@/generated/prisma/enums";
import { BATCH_STATUS_META } from "@/lib/batch-status";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { formatCivilDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { assessExpiry } from "@/lib/expiry";
import { getInventoryTotals } from "@/lib/queries/dashboard";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatQuantity, toNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Stock on hand" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const STATUS_FILTERS: { key: string; label: string; statuses: BatchStatus[] }[] = [
  { key: "onhand", label: "On hand", statuses: ["ACTIVE", "QUARANTINED"] },
  { key: "active", label: "Dispensable", statuses: ["ACTIVE"] },
  { key: "quarantined", label: "Quarantined", statuses: ["QUARANTINED"] },
  { key: "closed", label: "Closed", statuses: ["DEPLETED", "DISPOSED", "RETURNED"] },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await requirePermission("inventory.view");
  const settings = await getSettings();
  const params = await searchParams;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const filter =
    STATUS_FILTERS.find((f) => f.key === params.status) ?? STATUS_FILTERS[0];
  const query = params.q?.trim();

  const where: Prisma.BatchWhereInput = {
    status: { in: filter.statuses },
    // "On hand" means stock physically present, so empty batches are noise here.
    ...(filter.key === "onhand" || filter.key === "active"
      ? { quantityOnHand: { gt: 0 } }
      : {}),
    ...(query
      ? {
          OR: [
            { lotNumber: { contains: query, mode: "insensitive" } },
            { product: { genericName: { contains: query, mode: "insensitive" } } },
            { product: { brandName: { contains: query, mode: "insensitive" } } },
            { product: { sku: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [batches, total, totals] = await Promise.all([
    prisma.batch.findMany({
      where,
      orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        quantityOnHand: true,
        quantityReceived: true,
        costPerUnit: true,
        status: true,
        productId: true,
        product: {
          select: {
            genericName: true,
            brandName: true,
            strength: true,
            baseUnit: true,
            packUnit: true,
            unitsPerPack: true,
          },
        },
      },
    }),
    prisma.batch.count({ where }),
    getInventoryTotals(),
  ]);

  const canAdjust = can(user.role, "stock.adjust");
  const canDispose = can(user.role, "stock.dispose");

  const buildHref = (statusKey: string) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (statusKey !== "onhand") next.set("status", statusKey);
    const qs = next.toString();
    return qs ? `/inventory?${qs}` : "/inventory";
  };

  return (
    <>
      <PageHeader
        title="Stock on hand"
        description="Every batch in the pharmacy, soonest-expiring first."
        actions={
          can(user.role, "stock.receive") ? (
            <Button asChild>
              <Link href="/receive">
                <PackagePlus aria-hidden />
                Receive stock
              </Link>
            </Button>
          ) : null
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active batches" value={totals.activeBatches} />
        <StatCard label="Products stocked" value={totals.activeProducts} />
        <StatCard
          label="Stock value at cost"
          value={formatMoney(totals.stockValue, settings.currency, settings.locale)}
        />
        <StatCard
          label="Low or out of stock"
          value={totals.lowStockProducts + totals.outOfStockProducts}
          tone={
            totals.outOfStockProducts > 0
              ? "critical"
              : totals.lowStockProducts > 0
                ? "warning"
                : "ok"
          }
          href="/products?stock=low"
        />
      </section>

      <div className="mt-6">
        <TableCard
          toolbar={
            <>
              <SearchInput
                placeholder="Search by lot number, medicine or code..."
                className="sm:max-w-xs"
              />

              <nav className="flex flex-wrap gap-1" aria-label="Filter by batch status">
                {STATUS_FILTERS.map((option) => (
                  <Link
                    key={option.key}
                    href={buildHref(option.key)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      filter.key === option.key
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {option.label}
                  </Link>
                ))}
              </nav>
            </>
          }
        >
          {batches.length === 0 ? (
            <EmptyState
              icon={<Boxes className="size-5" />}
              title={query ? "No batches match" : "No stock here"}
              description={
                query
                  ? "Try a different search or filter."
                  : "Record a delivery to open the first batch."
              }
            />
          ) : (
            <>
              <DataTable caption="Batches currently held">
                <TableHead>
                  <Th>Medicine</Th>
                  <Th>Lot</Th>
                  <Th>Expires</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Value</Th>
                  <Th>Status</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </TableHead>

                <TableBody>
                  {batches.map((batch) => {
                    const expiry = assessExpiry(
                      batch.expiryDate,
                      settings.todayEpochDay,
                      settings.expiry,
                    );
                    const statusMeta = BATCH_STATUS_META[batch.status];
                    const label =
                      batch.product.brandName ?? batch.product.genericName;

                    return (
                      <Tr
                        key={batch.id}
                        className={cn(
                          expiry.status === "EXPIRED" &&
                            batch.quantityOnHand > 0 &&
                            "border-l-2 border-l-status-expired",
                          expiry.status === "CRITICAL" &&
                            batch.quantityOnHand > 0 &&
                            "border-l-2 border-l-status-critical",
                        )}
                      >
                        <Td>
                          <Link
                            href={`/products/${batch.productId}`}
                            className="font-medium hover:text-brand-700 hover:underline"
                          >
                            {label}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {batch.product.genericName}
                            {batch.product.strength
                              ? ` · ${batch.product.strength}`
                              : ""}
                          </p>
                        </Td>

                        <Td className="font-mono text-xs">{batch.lotNumber}</Td>

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
                          {formatQuantity(batch.quantityOnHand, {
                            baseUnit: batch.product.baseUnit,
                            packUnit: batch.product.packUnit,
                            unitsPerPack: batch.product.unitsPerPack,
                          })}
                          <p className="text-xs text-muted-foreground">
                            of {batch.quantityReceived} received
                          </p>
                        </Td>

                        <Td align="right" className="tabular">
                          {formatMoney(
                            batch.quantityOnHand * toNumber(batch.costPerUnit),
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

                        <Td align="right">
                          <BatchRowActions
                            batch={{
                              id: batch.id,
                              lotNumber: batch.lotNumber,
                              productLabel: label,
                              baseUnit: batch.product.baseUnit,
                              quantityOnHand: batch.quantityOnHand,
                              status: batch.status,
                              isExpired: expiry.status === "EXPIRED",
                            }}
                            canAdjust={canAdjust}
                            canDispose={canDispose}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </TableBody>
              </DataTable>

              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                searchParams={params}
                basePath="/inventory"
              />
            </>
          )}
        </TableCard>
      </div>
    </>
  );
}
