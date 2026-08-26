import type { Metadata } from "next";

import { DispenseForm } from "@/app/(app)/dispense/dispense-form";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { getPickerProducts } from "@/lib/queries/picker";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Dispense" };
export const dynamic = "force-dynamic";

export default async function DispensePage() {
  await requirePermission("stock.dispense");

  const [settings, products] = await Promise.all([
    getSettings(),
    getPickerProducts({ withStock: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Dispense"
        description="Record medicine going out. The system picks the soonest-expiring batch so stock does not age on the shelf."
      />

      <div className="max-w-3xl">
        <DispenseForm products={products} thresholds={settings.expiry} />
      </div>
    </>
  );
}
