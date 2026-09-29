import type { Metadata } from "next";

import { ReceiveForm } from "@/app/(app)/receive/receive-form";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { getPickerProducts } from "@/lib/queries/picker";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Receive stock (advanced)" };
export const dynamic = "force-dynamic";

export default async function AdvancedReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  await requirePermission("stock.advanced");

  const [settings, products, { product }] = await Promise.all([
    getSettings(),
    getPickerProducts(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Receive stock (advanced)"
        description="Every field on one form: lot number, expiry date, cost and notes."
      />

      <div className="max-w-3xl">
        <ReceiveForm
          products={products}
          currency={settings.currency}
          defaultProductId={product}
        />
      </div>
    </>
  );
}
