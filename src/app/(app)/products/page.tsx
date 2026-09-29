import type { Metadata } from "next";
import Link from "next/link";
import { Pill, Plus, Snowflake } from "lucide-react";

import { CategoryDialog } from "@/app/(app)/products/category-dialog";
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
import { ExpiryBadge, StockBadge } from "@/components/expiry-badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { formatCivilDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { assessExpiry, classifyStock } from "@/lib/expiry";
import { listProducts } from "@/lib/queries/products";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatQuantity } from "@/lib/units";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Items" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    supplier?: string;
    status?: string;
    stock?: string;
    page?: string;
  }>;
}) {
  const user = await requirePermission("inventory.view");
  const settings = await getSettings();
  const params = await searchParams;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const canManage = can(user.role, "catalogue.manage");

  const [{ rows, total }, categories] = await Promise.all([
    listProducts(
      {
        query: params.q?.trim(),
        categoryId: params.category,
        supplierId: params.supplier,
        status: params.status === "discontinued" || params.status === "all"
          ? params.status
          : "active",
        stock:
          params.stock === "low" || params.stock === "out" ? params.stock : "all",
      },
      page,
      PAGE_SIZE,
    ),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...patch })) {
      if (value && key !== "page") next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/products?${qs}` : "/products";
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap",
      active
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent/50",
    );

  return (
    <>
      <PageHeader
        title="Items"
        description="The item catalogue. Stock levels shown are dispensable units only."
        actions={
          canManage ? (
            <>
              <CategoryDialog />
              <Button asChild>
                <Link href="/products/new">
                  <Plus aria-hidden />
                  New item
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <TableCard
        toolbar={
          <>
            <SearchInput
              placeholder="Search by name, brand or code..."
              className="sm:max-w-xs"
            />

            <div className="flex flex-wrap items-center gap-3">
              <nav className="flex flex-wrap gap-1" aria-label="Filter by category">
                <Link href={buildHref({ category: undefined })} className={chip(!params.category)}>
                  All categories
                </Link>
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    href={buildHref({ category: c.id })}
                    className={chip(params.category === c.id)}
                  >
                    {c.name}
                  </Link>
                ))}
              </nav>

              <nav className="flex flex-wrap gap-1" aria-label="Filter by stock level">
                <Link href={buildHref({ stock: undefined })} className={chip(!params.stock)}>
                  Any stock
                </Link>
                <Link href={buildHref({ stock: "low" })} className={chip(params.stock === "low")}>
                  Low
                </Link>
                <Link href={buildHref({ stock: "out" })} className={chip(params.stock === "out")}>
                  Out
                </Link>
              </nav>
            </div>
          </>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Pill className="size-5" />}
            title="No products match"
            description={
              params.q || params.category || params.stock
                ? "Try clearing some filters."
                : "Add the items you stock to get started."
            }
            action={
              canManage && !params.q ? (
                <Button asChild size="sm">
                  <Link href="/products/new">Add the first product</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <DataTable caption="Product catalogue with current stock levels">
              <TableHead>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th align="right">On hand</Th>
                <Th>Stock</Th>
                <Th>Next expiry</Th>
                <Th align="right">Price</Th>
              </TableHead>

              <TableBody>
                {rows.map((row) => {
                  const stockStatus = classifyStock(row.onHand, row.reorderPoint);
                  const expiry = row.nearestExpiry
                    ? assessExpiry(
                        row.nearestExpiry,
                        settings.todayEpochDay,
                        settings.expiry,
                      )
                    : null;

                  return (
                    <Tr key={row.id} className={cn(!row.isActive && "opacity-60")}>
                      <Td>
                        <Link
                          href={`/products/${row.id}`}
                          className="font-medium hover:text-brand-700 hover:underline"
                        >
                          {row.brandName ?? row.genericName}
                        </Link>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>
                            {row.genericName}
                            {row.strength ? ` · ${row.strength}` : ""}
                          </span>
                          <span className="font-mono">{row.sku}</span>
                          {row.isRxOnly ? (
                            <span className="rounded bg-muted px-1 font-medium">Rx</span>
                          ) : null}
                          {row.requiresRefrigeration ? (
                            <Snowflake
                              className="size-3 text-brand-600"
                              aria-label="Requires refrigeration"
                            />
                          ) : null}
                          {!row.isActive ? (
                            <span className="rounded bg-muted px-1">Discontinued</span>
                          ) : null}
                        </p>
                      </Td>

                      <Td className="text-muted-foreground">{row.categoryName}</Td>

                      <Td align="right" className="tabular">
                        {formatQuantity(row.onHand, {
                          baseUnit: row.baseUnit,
                          packUnit: row.packUnit,
                          unitsPerPack: row.unitsPerPack,
                        })}
                        <p className="text-xs text-muted-foreground">
                          {row.activeBatches} batch
                          {row.activeBatches === 1 ? "" : "es"}
                        </p>
                      </Td>

                      <Td>
                        <StockBadge status={stockStatus} />
                        {stockStatus !== "OK" ? (
                          <p className="mt-1 text-xs text-muted-foreground tabular">
                            reorder at {row.reorderPoint}
                          </p>
                        ) : null}
                      </Td>

                      <Td>
                        {expiry && row.nearestExpiry ? (
                          <>
                            <span className="whitespace-nowrap tabular">
                              {formatCivilDate(row.nearestExpiry, settings.locale)}
                            </span>
                            <div className="mt-1">
                              <ExpiryBadge status={expiry.status} />
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </Td>

                      <Td align="right" className="tabular">
                        {formatMoney(row.sellingPrice, settings.currency, settings.locale)}
                        <p className="text-xs text-muted-foreground">
                          per {row.baseUnit}
                        </p>
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
              basePath="/products"
            />
          </>
        )}
      </TableCard>
    </>
  );
}
