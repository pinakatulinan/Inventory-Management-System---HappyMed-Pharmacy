import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";

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
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { formatCivilDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { PO_STATUS_META } from "@/lib/po-status";
import { getSettings } from "@/lib/settings";
import { formatMoney, toNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Purchase orders" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const FILTERS: { key: string; label: string; statuses?: PurchaseOrderStatus[] }[] = [
  {
    key: "open",
    label: "Open",
    statuses: ["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"],
  },
  { key: "received", label: "Received", statuses: ["RECEIVED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { key: "all", label: "All" },
];

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await requirePermission("po.view");
  const settings = await getSettings();
  const params = await searchParams;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const filter = FILTERS.find((f) => f.key === params.status) ?? FILTERS[0];
  const query = params.q?.trim();

  const where: Prisma.PurchaseOrderWhereInput = {
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
    ...(query
      ? {
          OR: [
            { poNumber: { contains: query, mode: "insensitive" } },
            { supplier: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        poNumber: true,
        status: true,
        orderDate: true,
        expectedDate: true,
        supplier: { select: { name: true } },
        createdBy: { select: { name: true } },
        items: {
          select: {
            quantityOrdered: true,
            quantityReceived: true,
            unitCost: true,
          },
        },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  const buildHref = (statusKey: string) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (statusKey !== "open") next.set("status", statusKey);
    const qs = next.toString();
    return qs ? `/purchase-orders?${qs}` : "/purchase-orders";
  };

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Order stock and track what has actually arrived."
        actions={
          can(user.role, "po.manage") ? (
            <Button asChild>
              <Link href="/purchase-orders/new">
                <Plus aria-hidden />
                New order
              </Link>
            </Button>
          ) : null
        }
      />

      <TableCard
        toolbar={
          <>
            <SearchInput
              placeholder="Search by order number or supplier..."
              className="sm:max-w-xs"
            />
            <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
              {FILTERS.map((option) => (
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
        {orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title={query ? "No orders match" : "No purchase orders"}
            description={
              query
                ? "Try a different search or filter."
                : "Raise an order when stock runs low."
            }
          />
        ) : (
          <>
            <DataTable caption="Purchase orders">
              <TableHead>
                <Th>Order</Th>
                <Th>Supplier</Th>
                <Th align="right">Lines</Th>
                <Th align="right">Progress</Th>
                <Th align="right">Value</Th>
                <Th>Expected</Th>
                <Th>Status</Th>
              </TableHead>

              <TableBody>
                {orders.map((order) => {
                  const ordered = order.items.reduce(
                    (n, i) => n + i.quantityOrdered,
                    0,
                  );
                  const received = order.items.reduce(
                    (n, i) => n + i.quantityReceived,
                    0,
                  );
                  const value = order.items.reduce(
                    (n, i) => n + i.quantityOrdered * toNumber(i.unitCost),
                    0,
                  );
                  const meta = PO_STATUS_META[order.status];
                  const percent =
                    ordered > 0
                      ? Math.min(100, Math.round((received / ordered) * 100))
                      : 0;

                  return (
                    <Tr key={order.id}>
                      <Td>
                        <Link
                          href={`/purchase-orders/${order.id}`}
                          className="font-mono font-medium hover:text-brand-700 hover:underline"
                        >
                          {order.poNumber}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatCivilDate(order.orderDate, settings.locale)}
                          {" · "}
                          {order.createdBy.name}
                        </p>
                      </Td>

                      <Td>{order.supplier.name}</Td>

                      <Td align="right" className="tabular">
                        {order.items.length}
                      </Td>

                      <Td align="right" className="tabular">
                        {received} / {ordered}
                        <div
                          className="ml-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-muted"
                          role="img"
                          aria-label={`${percent} percent received`}
                        >
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </Td>

                      <Td align="right" className="tabular">
                        {formatMoney(value, settings.currency, settings.locale)}
                      </Td>

                      <Td className="whitespace-nowrap tabular">
                        {order.expectedDate
                          ? formatCivilDate(order.expectedDate, settings.locale)
                          : "-"}
                      </Td>

                      <Td>
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                            meta.className,
                          )}
                        >
                          {meta.label}
                        </span>
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
              basePath="/purchase-orders"
            />
          </>
        )}
      </TableCard>
    </>
  );
}
