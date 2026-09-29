import type { Metadata } from "next";

import { DispenseForm } from "@/app/(app)/dispense/dispense-form";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { getPickerProducts } from "@/lib/queries/picker";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Dispense (advanced)" };
export const dynamic = "force-dynamic";

export default async function AdvancedDispensePage() {
  await requirePermission("stock.advanced");

  const [settings, products] = await Promise.all([
    getSettings(),
    getPickerProducts({ withStock: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Dispense (advanced)"
        description="Pick a specific batch instead of the soonest-expiring one, and add a reference or note."
      />

      <div className="max-w-3xl">
        <DispenseForm products={products} thresholds={settings.expiry} />
      </div>
    </>
  );
}
