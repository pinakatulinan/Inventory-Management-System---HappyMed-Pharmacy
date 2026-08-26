import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Phone, Truck } from "lucide-react";

import {
  CreateSupplierDialog,
  SupplierRowActions,
} from "@/app/(app)/suppliers/suppliers-client";
import { SearchInput } from "@/components/data-table/search-input";
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
import { PageHeader } from "@/components/page-header";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePermission("supplier.manage");

  const { q } = await searchParams;
  const query = q?.trim();

  const where: Prisma.SupplierWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { contactPerson: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      contactPerson: true,
      email: true,
      phone: true,
      address: true,
      notes: true,
      isActive: true,
      _count: { select: { products: true, purchaseOrders: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy from, and how to reach them."
        actions={<CreateSupplierDialog />}
      />

      <TableCard
        toolbar={
          <SearchInput
            placeholder="Search suppliers..."
            className="sm:max-w-xs"
          />
        }
      >
        {suppliers.length === 0 ? (
          <EmptyState
            icon={<Truck className="size-5" />}
            title={query ? "No suppliers match" : "No suppliers yet"}
            description={
              query
                ? "Try a different search term."
                : "Add the wholesalers you order stock from."
            }
          />
        ) : (
          <DataTable caption="Suppliers and their contact details">
            <TableHead>
              <Th>Supplier</Th>
              <Th>Contact</Th>
              <Th align="right">Products</Th>
              <Th align="right">Orders</Th>
              <Th>Status</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </TableHead>

            <TableBody>
              {suppliers.map((supplier) => (
                <Tr
                  key={supplier.id}
                  className={cn(!supplier.isActive && "opacity-60")}
                >
                  <Td>
                    <p className="font-medium">{supplier.name}</p>
                    {supplier.contactPerson ? (
                      <p className="text-xs text-muted-foreground">
                        {supplier.contactPerson}
                      </p>
                    ) : null}
                  </Td>

                  <Td>
                    <div className="space-y-0.5 text-xs">
                      {supplier.email ? (
                        <a
                          href={`mailto:${supplier.email}`}
                          className="flex items-center gap-1.5 text-brand-700 hover:underline"
                        >
                          <Mail className="size-3" aria-hidden />
                          {supplier.email}
                        </a>
                      ) : null}
                      {supplier.phone ? (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="size-3" aria-hidden />
                          {supplier.phone}
                        </span>
                      ) : null}
                      {!supplier.email && !supplier.phone ? (
                        <span className="text-muted-foreground">
                          No contact details
                        </span>
                      ) : null}
                    </div>
                  </Td>

                  <Td align="right" className="tabular">
                    {supplier._count.products > 0 ? (
                      <Link
                        href={`/products?supplier=${supplier.id}`}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {supplier._count.products}
                      </Link>
                    ) : (
                      supplier._count.products
                    )}
                  </Td>

                  <Td align="right" className="tabular">
                    {supplier._count.purchaseOrders}
                  </Td>

                  <Td>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                        supplier.isActive
                          ? "border-status-ok-border bg-status-ok-soft text-status-ok"
                          : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {supplier.isActive ? "Active" : "Inactive"}
                    </span>
                  </Td>

                  <Td align="right">
                    <SupplierRowActions
                      supplier={{
                        id: supplier.id,
                        name: supplier.name,
                        contactPerson: supplier.contactPerson,
                        email: supplier.email,
                        phone: supplier.phone,
                        address: supplier.address,
                        notes: supplier.notes,
                      }}
                      isActive={supplier.isActive}
                      productCount={supplier._count.products}
                    />
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </DataTable>
        )}
      </TableCard>
    </>
  );
}
