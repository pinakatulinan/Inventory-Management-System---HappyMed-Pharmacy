import type { Metadata } from "next";
import Link from "next/link";

import { ReceiveWizard } from "@/app/(app)/receive/receive-wizard";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import {
  getPickerProducts,
  getProductIdsWithKnownCost,
} from "@/lib/queries/picker";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Receive stock" };
export const dynamic = "force-dynamic";

export default async function ReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const user = await requirePermission("stock.receive");

  const [settings, products, costKnownIds, { product }] = await Promise.all([
    getSettings(),
    getPickerProducts(),
    getProductIdsWithKnownCost(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Receive stock"
        description="A delivery arrived. Answer a few questions and it is added to stock."
      />

      <div className="max-w-xl">
        <ReceiveWizard
          products={products}
          currency={settings.currency}
          costKnownIds={costKnownIds}
          defaultProductId={product}
        />

        {can(user.role, "stock.advanced") ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Need to enter a lot number or cost by hand?{" "}
            <Link href="/receive/advanced" className="font-medium underline">
              Advanced form
            </Link>
          </p>
        ) : null}
      </div>
    </>
  );
}
