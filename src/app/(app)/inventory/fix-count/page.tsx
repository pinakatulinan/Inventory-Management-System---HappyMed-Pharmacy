import type { Metadata } from "next";

import { FixCountForm } from "@/app/(app)/inventory/fix-count/fix-count-form";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { getPickerProducts } from "@/lib/queries/picker";

export const metadata: Metadata = { title: "Fix a count" };
export const dynamic = "force-dynamic";

export default async function FixCountPage() {
  await requirePermission("stock.count");
  const products = await getPickerProducts();

  return (
    <>
      <PageHeader
        title="Fix a count"
        description="The number on the screen does not match the shelf? Count the boxes and type what is really there."
      />

      <div className="max-w-xl">
        <FixCountForm products={products} />
      </div>
    </>
  );
}
