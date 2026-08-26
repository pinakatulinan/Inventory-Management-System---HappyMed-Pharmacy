import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes } from "lucide-react";

import {
  OrderStatusButton,
  ReceiveLineButton,
} from "@/app/(app)/purchase-orders/[id]/order-client";
import {
  DataTable,
  TableBody,
  TableCard,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/data-table/table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { formatCivilDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { PO_STATUS_META } from "@/lib/po-status";
import { getSettings } from "@/lib/settings";
import { formatMoney, toNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { poNumber: true },
  });
  return { title: order?.poNumber ?? "Purchase order" };
}

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("po.view");
  const settings = await getSettings();
  const { id } = await params;

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      poNumber: true,
      status: true,
      orderDate: true,
      expectedDate: true,
      receivedDate: true,
      notes: true,
      supplier: { select: { id: true, name: true, email: true, phone: true } },
      createdBy: { select: { name: true } },
      receivedBy: { select: { name: true } },
      items: {
        orderBy: { product: { genericName: "asc" } },
        select: {
          id: true,
          quantityOrdered: true,
          quantityReceived: true,
          unitCost: true,
          product: {
            select: {
              id: true,
              genericName: true,
              brandName: true,
              strength: true,
              baseUnit: true,
              packUnit: true,
              unitsPerPack: true,
            },
          },
        },
      },
      batches: {
        orderBy: { receivedDate: "desc" },
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          quantityReceived: true,
          receivedDate: true,
          product: { select: { genericName: true, brandName: true } },
        },
      },
    },
  });

  if (!order) notFound();

  const canManage = can(user.role, "po.manage");
  const canReceive = can(user.role, "stock.receive");
  const meta = PO_STATUS_META[order.status];

  const ordered = order.items.reduce((n, i) => n + i.quantityOrdered, 0);
  const received = order.items.reduce((n, i) => n + i.quantityReceived, 0);
  const value = order.items.reduce(
    (n, i) => n + i.quantityOrdered * toNumber(i.unitCost),
    0,
  );
  const receivedValue = order.items.reduce(
    (n, i) => n + i.quantityReceived * toNumber(i.unitCost),
    0,
  );

  const isOpen =
    order.status === "DRAFT" ||
    order.status === "SUBMITTED" ||
    order.status === "PARTIALLY_RECEIVED";

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
        title={order.poNumber}
        description={`${order.supplier.name} · ordered ${formatCivilDate(order.orderDate, settings.locale)} by ${order.createdBy.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && order.status === "DRAFT" ? (
              <OrderStatusButton
                orderId={order.id}
                status="SUBMITTED"
                label="Mark as sent"
                icon="send"
                confirmTitle={`Send ${order.poNumber}?`}
                confirmBody="Marks the order as sent to the supplier. You can still receive against it and it stays editable in the sense that deliveries can be booked in."
              />
            ) : null}

            {canManage && isOpen ? (
              <OrderStatusButton
                orderId={order.id}
                status="CANCELLED"
                label="Cancel order"
                icon="cancel"
                variant="outline"
                confirmTitle={`Cancel ${order.poNumber}?`}
                confirmBody="This only works if no stock has been received against the order yet."
              />
            ) : null}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
            meta.className,
          )}
        >
          {meta.label}
        </span>
        {order.expectedDate ? (
          <span className="text-xs text-muted-foreground">
            Expected {formatCivilDate(order.expectedDate, settings.locale)}
          </span>
        ) : null}
        {order.receivedDate && order.receivedBy ? (
          <span className="text-xs text-muted-foreground">
            Completed {formatCivilDate(order.receivedDate, settings.locale)} by{" "}
            {order.receivedBy.name}
          </span>
        ) : null}
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lines" value={order.items.length} />
        <StatCard
          label="Units received"
          value={`${received} / ${ordered}`}
          tone={received >= ordered ? "ok" : received > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Order value"
          value={formatMoney(value, settings.currency, settings.locale)}
        />
        <StatCard
          label="Received value"
          value={formatMoney(receivedValue, settings.currency, settings.locale)}
        />
      </section>

      {order.notes ? (
        <p className="mt-6 rounded-lg border bg-card px-4 py-3 text-sm">
          <span className="font-medium">Notes: </span>
          {order.notes}
        </p>
      ) : null}

      <div className="mt-6">
        <TableCard
          toolbar={
            <div>
              <h2 className="text-sm font-semibold">Order lines</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Receiving a line records the lot number and expiry date, and adds
                the stock to the shelf
              </p>
            </div>
          }
        >
          <DataTable caption="Lines on this purchase order">
            <TableHead>
              <Th>Product</Th>
              <Th align="right">Ordered</Th>
              <Th align="right">Received</Th>
              <Th align="right">Outstanding</Th>
              <Th align="right">Unit cost</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </TableHead>

            <TableBody>
              {order.items.map((item) => {
                const outstanding = Math.max(
                  0,
                  item.quantityOrdered - item.quantityReceived,
                );
                const label =
                  item.product.brandName ?? item.product.genericName;

                return (
                  <Tr key={item.id}>
                    <Td>
                      <Link
                        href={`/products/${item.product.id}`}
                        className="font-medium hover:text-brand-700 hover:underline"
                      >
                        {label}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.product.genericName}
                        {item.product.strength ? ` · ${item.product.strength}` : ""}
                      </p>
                    </Td>

                    <Td align="right" className="tabular">
                      {item.quantityOrdered} {item.product.baseUnit}
                    </Td>

                    <Td align="right" className="tabular">
                      {item.quantityReceived}
                    </Td>

                    <Td
                      align="right"
                      className={cn(
                        "tabular",
                        outstanding === 0 && "text-status-ok",
                      )}
                    >
                      {outstanding === 0 ? "Complete" : outstanding}
                    </Td>

                    <Td align="right" className="tabular">
                      {formatMoney(item.unitCost, settings.currency, settings.locale)}
                    </Td>

                    <Td align="right">
                      {canReceive && isOpen && outstanding > 0 ? (
                        <ReceiveLineButton
                          purchaseOrderId={order.id}
                          itemId={item.id}
                          productLabel={label}
                          baseUnit={item.product.baseUnit}
                          outstanding={outstanding}
                          defaultUnitCost={item.unitCost.toString()}
                        />
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </TableBody>
          </DataTable>
        </TableCard>
      </div>

      {order.batches.length > 0 ? (
        <div className="mt-6">
          <TableCard
            toolbar={
              <div>
                <h2 className="text-sm font-semibold">Batches created</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Stock booked in against this order
                </p>
              </div>
            }
          >
            <DataTable caption="Batches created from this order">
              <TableHead>
                <Th>Product</Th>
                <Th>Lot</Th>
                <Th align="right">Quantity</Th>
                <Th>Expires</Th>
                <Th>Received</Th>
              </TableHead>

              <TableBody>
                {order.batches.map((batch) => (
                  <Tr key={batch.id}>
                    <Td>{batch.product.brandName ?? batch.product.genericName}</Td>
                    <Td className="font-mono text-xs">{batch.lotNumber}</Td>
                    <Td align="right" className="tabular">
                      {batch.quantityReceived}
                    </Td>
                    <Td className="whitespace-nowrap tabular">
                      {formatCivilDate(batch.expiryDate, settings.locale)}
                    </Td>
                    <Td className="whitespace-nowrap tabular">
                      {formatCivilDate(batch.receivedDate, settings.locale)}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </DataTable>
          </TableCard>
        </div>
      ) : (
        <p className="mt-6 flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          <Boxes className="size-4" aria-hidden />
          No stock received against this order yet.
        </p>
      )}
    </>
  );
}
