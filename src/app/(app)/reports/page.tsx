import type { Metadata } from "next";
import Link from "next/link";
import { PartyPopper, Snail, Trash2 } from "lucide-react";

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
import { ExpiryBadge } from "@/components/expiry-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { requirePermission } from "@/lib/auth/session";
import { formatCivilDate } from "@/lib/dates";
import { assessExpiry } from "@/lib/expiry";
import { MOVEMENT_LABELS } from "@/lib/queries/dashboard";
import {
  getMovementSummary,
  getSlowMovers,
  getValuation,
  getWastage,
} from "@/lib/queries/reports";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/units";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; by?: string }>;
}) {
  await requirePermission("reports.view");
  const settings = await getSettings();
  const params = await searchParams;

  const period = PERIODS.find((p) => p.key === params.period) ?? PERIODS[0];
  const groupBy = params.by === "supplier" ? "supplier" : "category";

  const to = new Date();
  const from = new Date(to.getTime() - period.days * 86_400_000);

  const [valuation, wastage, movements, slowMovers] = await Promise.all([
    getValuation(groupBy),
    getWastage(from, to),
    getMovementSummary(from, to),
    getSlowMovers(from, to),
  ]);

  const money = (n: number) =>
    formatMoney(n, settings.currency, settings.locale);

  const totalCost = valuation.reduce((n, r) => n + r.costValue, 0);
  const totalRetail = valuation.reduce((n, r) => n + r.retailValue, 0);
  const totalWastage = wastage.reduce((n, r) => n + r.costValue, 0);
  const slowValue = slowMovers.reduce((n, r) => n + r.costValue, 0);
  const margin = totalRetail > 0 ? (1 - totalCost / totalRetail) * 100 : 0;

  const chip = (active: boolean) =>
    cn(
      "rounded-md px-2.5 py-1 text-xs font-medium",
      active
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent/50",
    );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Stock value, wastage and what is not moving."
        actions={
          <nav className="flex flex-wrap gap-1" aria-label="Reporting period">
            {PERIODS.map((option) => (
              <Link
                key={option.key}
                href={`/reports?period=${option.key}${groupBy === "supplier" ? "&by=supplier" : ""}`}
                className={chip(period.key === option.key)}
              >
                {option.label}
              </Link>
            ))}
          </nav>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock at cost" value={money(totalCost)} />
        <StatCard label="Stock at retail" value={money(totalRetail)} />
        <StatCard
          label="Gross margin"
          value={`${margin.toFixed(1)}%`}
          hint="On stock currently held"
          tone={margin > 0 ? "ok" : "default"}
        />
        <StatCard
          label={`Wastage, ${period.label.toLowerCase()}`}
          value={money(totalWastage)}
          hint={`${wastage.length} product(s) written off`}
          tone={totalWastage > 0 ? "critical" : "ok"}
        />
      </section>

      {/* Valuation */}
      <div className="mt-6">
        <TableCard
          toolbar={
            <>
              <div>
                <h2 className="text-sm font-semibold">Stock valuation</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Dispensable stock only, at acquisition cost
                </p>
              </div>
              <nav className="flex gap-1" aria-label="Group valuation by">
                <Link
                  href={`/reports?period=${period.key}`}
                  className={chip(groupBy === "category")}
                >
                  By category
                </Link>
                <Link
                  href={`/reports?period=${period.key}&by=supplier`}
                  className={chip(groupBy === "supplier")}
                >
                  By supplier
                </Link>
              </nav>
            </>
          }
        >
          {valuation.length === 0 ? (
            <EmptyState title="No stock to value" />
          ) : (
            <DataTable caption={`Stock value by ${groupBy}`}>
              <TableHead>
                <Th>{groupBy === "category" ? "Category" : "Supplier"}</Th>
                <Th align="right">Products</Th>
                <Th align="right">Batches</Th>
                <Th align="right">Units</Th>
                <Th align="right">At cost</Th>
                <Th align="right">At retail</Th>
                <Th align="right">Share</Th>
              </TableHead>

              <TableBody>
                {valuation.map((row) => (
                  <Tr key={row.name}>
                    <Td className="font-medium">{row.name}</Td>
                    <Td align="right" className="tabular">{row.products}</Td>
                    <Td align="right" className="tabular">{row.batches}</Td>
                    <Td align="right" className="tabular">
                      {row.units.toLocaleString()}
                    </Td>
                    <Td align="right" className="tabular">
                      {money(row.costValue)}
                    </Td>
                    <Td align="right" className="tabular text-muted-foreground">
                      {money(row.retailValue)}
                    </Td>
                    <Td align="right" className="tabular">
                      {totalCost > 0
                        ? `${((row.costValue / totalCost) * 100).toFixed(1)}%`
                        : "-"}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </DataTable>
          )}
        </TableCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Wastage */}
        <TableCard
          toolbar={
            <div>
              <h2 className="text-sm font-semibold">Wastage</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Stock disposed of in the period, at what it cost you
              </p>
            </div>
          }
        >
          {wastage.length === 0 ? (
            <EmptyState
              icon={<PartyPopper className="size-5" />}
              title="Nothing written off"
              description={`No disposals in the ${period.label.toLowerCase()}.`}
            />
          ) : (
            <DataTable caption="Stock written off in the period">
              <TableHead>
                <Th>Medicine</Th>
                <Th align="right">Units</Th>
                <Th align="right">Events</Th>
                <Th align="right">Cost</Th>
              </TableHead>
              <TableBody>
                {wastage.map((row) => (
                  <Tr key={row.productId}>
                    <Td>
                      <Link
                        href={`/products/${row.productId}`}
                        className="font-medium hover:text-brand-700 hover:underline"
                      >
                        {row.brandName ?? row.genericName}
                      </Link>
                    </Td>
                    <Td align="right" className="tabular">
                      {row.units} {row.baseUnit}
                    </Td>
                    <Td align="right" className="tabular">{row.events}</Td>
                    <Td align="right" className="tabular text-status-expired">
                      {money(row.costValue)}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </DataTable>
          )}
        </TableCard>

        {/* Movement summary */}
        <section className="rounded-xl border bg-card shadow-xs">
          <header className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Stock movement</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              What happened in the {period.label.toLowerCase()}
            </p>
          </header>

          {movements.length === 0 ? (
            <EmptyState title="No movements in this period" />
          ) : (
            <ul className="divide-y">
              {movements.map((row) => (
                <li
                  key={row.type}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {MOVEMENT_LABELS[row.type]}
                    </p>
                    <p className="text-xs text-muted-foreground tabular">
                      {row.events} event{row.events === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular">
                    {row.units.toLocaleString()} units
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Slow movers */}
      <div className="mt-6">
        <TableCard
          toolbar={
            <>
              <div>
                <h2 className="text-sm font-semibold">Not moving</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  In stock but not dispensed once in the {period.label.toLowerCase()}
                </p>
              </div>
              {slowValue > 0 ? (
                <p className="text-sm font-medium text-status-warning tabular">
                  {money(slowValue)} tied up
                </p>
              ) : null}
            </>
          }
        >
          {slowMovers.length === 0 ? (
            <EmptyState
              icon={<Snail className="size-5" />}
              title="Everything is moving"
              description="Every product in stock has been dispensed at least once in this period."
            />
          ) : (
            <DataTable caption="Products in stock with no dispensing in the period">
              <TableHead>
                <Th>Medicine</Th>
                <Th align="right">On hand</Th>
                <Th align="right">Tied-up cost</Th>
                <Th>Nearest expiry</Th>
              </TableHead>
              <TableBody>
                {slowMovers.map((row) => {
                  const expiry = row.nearestExpiry
                    ? assessExpiry(
                        row.nearestExpiry,
                        settings.todayEpochDay,
                        settings.expiry,
                      )
                    : null;

                  return (
                    <Tr key={row.productId}>
                      <Td>
                        <Link
                          href={`/products/${row.productId}`}
                          className="font-medium hover:text-brand-700 hover:underline"
                        >
                          {row.brandName ?? row.genericName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {row.genericName}
                        </p>
                      </Td>
                      <Td align="right" className="tabular">
                        {row.onHand} {row.baseUnit}
                      </Td>
                      <Td align="right" className="tabular">
                        {money(row.costValue)}
                      </Td>
                      <Td>
                        {row.nearestExpiry && expiry ? (
                          <>
                            <span className="whitespace-nowrap tabular">
                              {formatCivilDate(row.nearestExpiry, settings.locale)}
                            </span>
                            <div className="mt-1">
                              <ExpiryBadge
                                status={expiry.status}
                                daysLeft={expiry.daysLeft}
                              />
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TableBody>
            </DataTable>
          )}
        </TableCard>
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Trash2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Wastage is costed at each batch&apos;s own acquisition cost, so it
        reflects money actually spent on stock that was thrown away.
      </p>
    </>
  );
}
