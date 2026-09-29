import type { Metadata } from "next";

import { SimpleDispenseForm } from "@/app/(app)/dispense/simple-dispense-form";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { getPickerProducts } from "@/lib/queries/picker";

export const metadata: Metadata = { title: "Dispense" };
export const dynamic = "force-dynamic";

export default async function DispensePage() {
  const user = await requirePermission("stock.dispense");
  const products = await getPickerProducts({ withStock: true });

  return (
    <>
      <PageHeader
        title="Dispense"
        description="Give items to a customer. The system takes it from the batch that expires first."
      />

      <div className="max-w-xl">
        <SimpleDispenseForm
          products={products}
          showAdvancedLink={can(user.role, "stock.advanced")}
        />
      </div>
    </>
  );
}
