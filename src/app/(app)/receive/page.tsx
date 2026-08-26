import type { Metadata } from "next";

import { ReceiveForm } from "@/app/(app)/receive/receive-form";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { getPickerProducts } from "@/lib/queries/picker";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Receive stock" };
export const dynamic = "force-dynamic";

export default async function ReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  await requirePermission("stock.receive");

  const [settings, products, { product }] = await Promise.all([
    getSettings(),
    getPickerProducts(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Receive stock"
        description="Book in a delivery. Record the lot number and expiry date from each carton, not just the total."
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
