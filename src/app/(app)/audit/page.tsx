import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

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
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { formatInstant } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Colour by intent, not by entity: destructive actions must stand out. */
function actionTone(action: string): string {
  if (/dispose|deactivate|delete|lockout|quarantine/.test(action)) {
    return "border-status-expired-border bg-status-expired-soft text-status-expired";
  }
  if (/adjust|role_change|password_reset|return/.test(action)) {
    return "border-status-warning-border bg-status-warning-soft text-status-warning";
  }
  if (/create|receive|activate/.test(action)) {
    return "border-status-ok-border bg-status-ok-soft text-status-ok";
  }
  return "border-border bg-muted text-muted-foreground";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; user?: string; page?: string }>;
}) {
  await requirePermission("audit.view");
  const settings = await getSettings();

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const query = params.q?.trim();

  const where: Prisma.AuditLogWhereInput = {
    ...(params.user ? { userId: params.user } : {}),
    ...(query
      ? {
          OR: [
            { summary: { contains: query, mode: "insensitive" } },
            { action: { contains: query, mode: "insensitive" } },
            { entity: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [entries, total, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change to stock, catalogue and accounts, with who made it and why."
      />

      <TableCard
        toolbar={
          <>
            <SearchInput
              placeholder="Search actions and descriptions..."
              className="sm:max-w-xs"
            />

            <nav className="flex flex-wrap items-center gap-1.5" aria-label="Filter by person">
              <Link
                href={query ? `/audit?q=${encodeURIComponent(query)}` : "/audit"}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  !params.user
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                Everyone
              </Link>
              {actors.map((actor) => {
                const search = new URLSearchParams();
                if (query) search.set("q", query);
                search.set("user", actor.id);
                return (
                  <Link
                    key={actor.id}
                    href={`/audit?${search.toString()}`}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      params.user === actor.id
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {actor.name.split(/\s+/)[0]}
                  </Link>
                );
              })}
            </nav>
          </>
        }
      >
        {entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="size-5" />}
            title="Nothing recorded yet"
            description={
              query
                ? "No entries match that search."
                : "Changes to stock, catalogue and accounts will appear here."
            }
          />
        ) : (
          <>
            <DataTable caption="Audit trail of changes">
              <TableHead>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>What happened</Th>
              </TableHead>

              <TableBody>
                {entries.map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground tabular">
                      {formatInstant(entry.createdAt, settings.timeZone, settings.locale)}
                    </Td>

                    <Td className="whitespace-nowrap">
                      {entry.user?.name ?? (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </Td>

                    <Td>
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 font-mono text-xs",
                          actionTone(entry.action),
                        )}
                      >
                        {entry.action}
                      </span>
                    </Td>

                    <Td>
                      {entry.summary}
                      {entry.ipAddress ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          from {entry.ipAddress}
                        </span>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </DataTable>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              searchParams={params}
              basePath="/audit"
            />
          </>
        )}
      </TableCard>
    </>
  );
}
