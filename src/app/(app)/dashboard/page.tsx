import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  PackageX,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { formatCivilDate, formatRelative } from "@/lib/dates";
import {
  getInventoryTotals,
  getLowStockProducts,
  getRecentMovements,
  MOVEMENT_LABELS,
} from "@/lib/queries/dashboard";
import { getExpiringBatches, getExpirySummary } from "@/lib/queries/expiry";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatQuantity } from "@/lib/units";

export const metadata: Metadata = { title: "Dashboard" };

// Stock levels change constantly; never serve a cached dashboard.
export const dynamic = "force-dynamic";

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const settings = await getSettings();

  // Independent queries, so run them together rather than in sequence.
  const [expiry, totals, expiringBatches, lowStock, movements] =
    await Promise.all([
      getExpirySummary(settings),
      getInventoryTotals(),
      getExpiringBatches(settings, { limit: 8 }),
      getLowStockProducts(6),
      getRecentMovements(6),
    ]);

  const money = (value: number) =>
    formatMoney(value, settings.currency, settings.locale);

  return (
    <>
      <PageHeader
        title={`Good day, ${firstName(user.name)}`}
        description={`Here is where ${settings.pharmacyName} stands today.`}
        actions={
          <Button asChild>
            <Link href="/expiry">
              Review expiry alerts
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />

      {/* Headline numbers. Expiry first - it is the reason this system exists. */}
      <section
        aria-label="Key figures"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Expired on shelf"
          value={expiry.expired}
          hint={
            expiry.expired > 0
              ? "Quarantined automatically. Remove and dispose."
              : "Nothing expired. Well done."
          }
          tone={expiry.expired > 0 ? "expired" : "ok"}
          icon={<ShieldAlert className="size-4" />}
          href="/expiry?status=expired"
        />

        <StatCard
          label={`Expiring within ${settings.expiry.criticalDays} days`}
          value={expiry.critical}
          hint={
            expiry.critical > 0
              ? `${money(expiry.valueAtRisk)} of stock at risk`
              : "No batches in the critical window."
          }
          tone={expiry.critical > 0 ? "critical" : "ok"}
          icon={<CalendarClock className="size-4" />}
          href="/expiry?status=critical"
        />

        <StatCard
          label="Low or out of stock"
          value={totals.lowStockProducts + totals.outOfStockProducts}
          hint={`${totals.outOfStockProducts} out of stock, ${totals.lowStockProducts} below reorder point`}
          tone={
            totals.outOfStockProducts > 0
              ? "critical"
              : totals.lowStockProducts > 0
                ? "warning"
                : "ok"
          }
          icon={<TrendingDown className="size-4" />}
          href="/inventory?filter=low"
        />

        <StatCard
          label="Stock value"
          value={money(totals.stockValue)}
          hint={`${totals.activeBatches} active batches across ${totals.activeProducts} products`}
          icon={<Wallet className="size-4" />}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Expiry watchlist */}
        <section
          aria-labelledby="expiry-heading"
          className="rounded-xl border bg-card shadow-xs xl:col-span-2"
        >
          <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2
                id="expiry-heading"
                className="text-sm font-semibold text-foreground"
              >
                Expiry watchlist
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Soonest-expiring batches still holding stock
              </p>
            </div>

            <Button asChild variant="ghost" size="sm">
              <Link href="/expiry">View all</Link>
            </Button>
          </header>

          {expiringBatches.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="size-5" />}
              title="Nothing expiring soon"
              description={`No batch expires within the next ${settings.expiry.warningDays} days.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Medicine
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Lot
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      On hand
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Expires
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {expiringBatches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <Link
                          href={`/products/${batch.productId}`}
                          className="font-medium text-foreground hover:text-brand-700 hover:underline"
                        >
                          {batch.brandName ?? batch.genericName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {batch.genericName}
                          {batch.strength ? ` · ${batch.strength}` : ""}
                        </p>
                      </td>

                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {batch.lotNumber}
                      </td>

                      <td className="px-3 py-3 text-right tabular">
                        {formatQuantity(batch.quantityOnHand, {
                          baseUnit: batch.baseUnit,
                          packUnit: batch.packUnit,
                          unitsPerPack: batch.unitsPerPack,
                        })}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 tabular">
                        {formatCivilDate(batch.expiryDate, settings.locale)}
                      </td>

                      <td className="px-5 py-3">
                        <ExpiryBadge
                          status={batch.assessment.status}
                          daysLeft={batch.assessment.daysLeft}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Reorder list */}
        <section
          aria-labelledby="lowstock-heading"
          className="rounded-xl border bg-card shadow-xs"
        >
          <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2
                id="lowstock-heading"
                className="text-sm font-semibold text-foreground"
              >
                Needs reordering
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                At or below the reorder point
              </p>
            </div>
          </header>

          {lowStock.length === 0 ? (
            <EmptyState
              icon={<PackageX className="size-5" />}
              title="Everything is stocked"
              description="No product has fallen to its reorder point."
            />
          ) : (
            <ul className="divide-y">
              {lowStock.map((product) => (
                <li key={product.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/products/${product.id}`}
                        className="truncate text-sm font-medium hover:text-brand-700 hover:underline"
                      >
                        {product.brandName ?? product.genericName}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {product.supplierName ?? "No supplier set"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={
                          product.onHand <= 0
                            ? "text-sm font-semibold text-status-expired tabular"
                            : "text-sm font-semibold text-status-critical tabular"
                        }
                      >
                        {product.onHand}
                      </p>
                      <p className="text-xs text-muted-foreground tabular">
                        of {product.reorderPoint} {product.baseUnit}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Activity */}
      <section
        aria-labelledby="activity-heading"
        className="mt-6 rounded-xl border bg-card shadow-xs"
      >
        <header className="border-b px-5 py-4">
          <h2
            id="activity-heading"
            className="text-sm font-semibold text-foreground"
          >
            Recent stock movements
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every change to stock, and who made it
          </p>
        </header>

        {movements.length === 0 ? (
          <EmptyState
            icon={<CircleAlert className="size-5" />}
            title="No movements recorded yet"
            description="Receiving or dispensing stock will show up here."
          />
        ) : (
          <ul className="divide-y">
            {movements.map((movement) => (
              <li
                key={movement.id}
                className="flex items-center gap-4 px-5 py-3"
              >
                <span
                  className={
                    movement.quantity > 0
                      ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-status-ok-soft text-xs font-semibold text-status-ok tabular"
                      : "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular"
                  }
                  aria-hidden
                >
                  {movement.quantity > 0 ? "+" : ""}
                  {movement.quantity}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium">
                      {MOVEMENT_LABELS[movement.type]}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {Math.abs(movement.quantity)} {movement.baseUnit} of{" "}
                    </span>
                    <span className="font-medium">
                      {movement.brandName ?? movement.genericName}
                    </span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({movement.lotNumber})
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {movement.userName}
                    {movement.reason ? ` · ${movement.reason}` : ""}
                  </p>
                </div>

                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelative(movement.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
