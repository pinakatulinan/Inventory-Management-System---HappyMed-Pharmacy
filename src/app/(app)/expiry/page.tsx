import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, PartyPopper, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { requirePermission } from "@/lib/auth/session";
import { formatCivilDate } from "@/lib/dates";
import { EXPIRY_STATUS_META, type ExpiryStatus } from "@/lib/expiry";
import { getExpiringBatches, getExpirySummary } from "@/lib/queries/expiry";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatQuantity, toNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Expiry alerts" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "expired", label: "Expired" },
  { key: "critical", label: "Critical" },
  { key: "warning", label: "Warning" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function parseFilter(value: string | undefined): FilterKey {
  return FILTERS.some((f) => f.key === value) ? (value as FilterKey) : "all";
}

const FILTER_TO_STATUS: Record<Exclude<FilterKey, "all">, ExpiryStatus> = {
  expired: "EXPIRED",
  critical: "CRITICAL",
  warning: "WARNING",
};

export default async function ExpiryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermission("inventory.view");

  const settings = await getSettings();
  const { status } = await searchParams;
  const filter = parseFilter(status);

  const [summary, batches] = await Promise.all([
    getExpirySummary(settings),
    getExpiringBatches(settings, { limit: 500 }),
  ]);

  const visible =
    filter === "all"
      ? batches
      : batches.filter(
          (b) => b.assessment.status === FILTER_TO_STATUS[filter],
        );

  const money = (value: number) =>
    formatMoney(value, settings.currency, settings.locale);

  const counts: Record<FilterKey, number> = {
    all: summary.expired + summary.critical + summary.warning,
    expired: summary.expired,
    critical: summary.critical,
    warning: summary.warning,
  };

  return (
    <>
      <PageHeader
        title="Expiry alerts"
        description={`Batches expiring within ${settings.expiry.warningDays} days, soonest first. Expired stock is quarantined automatically and cannot be dispensed.`}
      />

      <section
        aria-label="Expiry summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Expired"
          value={summary.expired}
          hint="Blocked from dispensing"
          tone={summary.expired > 0 ? "expired" : "ok"}
          icon={<ShieldAlert className="size-4" />}
        />
        <StatCard
          label={`Critical (${settings.expiry.criticalDays} days)`}
          value={summary.critical}
          hint="Prioritise these for dispensing"
          tone={summary.critical > 0 ? "critical" : "ok"}
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label={`Warning (${settings.expiry.warningDays} days)`}
          value={summary.warning}
          hint="Watch, no action needed yet"
          tone={summary.warning > 0 ? "warning" : "ok"}
        />
        <StatCard
          label="Value at risk"
          value={money(summary.valueAtRisk)}
          hint="Cost of expired and critical stock"
        />
      </section>

      {/* Filter tabs, driven by the URL so a filtered view can be bookmarked */}
      <nav
        aria-label="Filter by status"
        className="mt-6 flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1"
      >
        {FILTERS.map((option) => {
          const active = filter === option.key;
          return (
            <Link
              key={option.key}
              href={
                option.key === "all" ? "/expiry" : `/expiry?status=${option.key}`
              }
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
              )}
            >
              {option.label}
              <span className="rounded-full bg-muted px-1.5 text-xs tabular">
                {counts[option.key]}
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="mt-4 rounded-xl border bg-card shadow-xs">
        {visible.length === 0 ? (
          <EmptyState
            icon={<PartyPopper className="size-5" />}
            title={
              filter === "all"
                ? "Nothing expiring soon"
                : `No ${filter} batches`
            }
            description={
              filter === "all"
                ? `No batch expires within the next ${settings.expiry.warningDays} days.`
                : "Try a different filter to see other batches."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Batches approaching or past their expiry date
              </caption>

              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Medicine
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Lot
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    On hand
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Value
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Expires
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {visible.map((batch) => {
                  const meta = EXPIRY_STATUS_META[batch.assessment.status];
                  const value =
                    batch.quantityOnHand * toNumber(batch.costPerUnit);

                  return (
                    <tr
                      key={batch.id}
                      className={cn(
                        "hover:bg-accent/40",
                        // A quiet left rule keeps the row scannable without
                        // flooding the table with colour.
                        batch.assessment.status === "EXPIRED" &&
                          "border-l-2 border-l-status-expired",
                        batch.assessment.status === "CRITICAL" &&
                          "border-l-2 border-l-status-critical",
                      )}
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/products/${batch.productId}`}
                          className="font-medium hover:text-brand-700 hover:underline"
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

                      <td className="px-3 py-3 text-muted-foreground">
                        {batch.categoryName}
                      </td>

                      <td className="px-3 py-3 text-right tabular">
                        {formatQuantity(batch.quantityOnHand, {
                          baseUnit: batch.baseUnit,
                          packUnit: batch.packUnit,
                          unitsPerPack: batch.unitsPerPack,
                        })}
                      </td>

                      <td className="px-3 py-3 text-right tabular">
                        {money(value)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 tabular">
                        {formatCivilDate(batch.expiryDate, settings.locale)}
                      </td>

                      <td className="px-5 py-3">
                        <ExpiryBadge
                          status={batch.assessment.status}
                          daysLeft={batch.assessment.daysLeft}
                        />
                        <span className="sr-only">{meta.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
