"use client";

import { CalendarClock, TriangleAlert } from "lucide-react";

import { updateBatchExpiryAction } from "@/app/(app)/inventory/actions";
import { Field, FormError, SubmitButton } from "@/components/form/form-parts";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/form/use-action";
import { BATCH_STATUS_META } from "@/lib/batch-status";
import type { BatchStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export interface EditableBatch {
  id: string;
  lotNumber: string;
  /** yyyy-mm-dd, ready for a date input. */
  expiryDate: string;
  quantityOnHand: number;
  status: BatchStatus;
  /** Placeholder written by the opening-stock import, not a real date. */
  unverified: boolean;
}

function BatchExpiryRow({ batch, baseUnit }: { batch: EditableBatch; baseUnit: string }) {
  const [state, formAction] = useAction(updateBatchExpiryAction);
  const meta = BATCH_STATUS_META[batch.status];

  return (
    <li className="px-4 py-3.5">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="batchId" value={batch.id} />

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="font-mono text-sm font-medium">{batch.lotNumber}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular">
              {batch.quantityOnHand.toLocaleString()} {baseUnit}
              {batch.quantityOnHand === 1 ? "" : "s"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-medium",
                meta.className,
              )}
            >
              {meta.label}
            </span>
          </div>
        </div>

        {batch.unverified ? (
          <p className="flex items-start gap-2 text-xs text-status-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Placeholder date from the import. Enter the real one off the box to
            put this stock back on sale.
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <Field
            name="expiryDate"
            label="Expiry date"
            required
            defaultValue={batch.expiryDate}
            error={state.ok ? undefined : state.fieldErrors?.expiryDate}
            className="min-w-45 flex-1"
          >
            {(props) => <Input {...props} type="date" required />}
          </Field>

          <SubmitButton pendingLabel="Saving..." variant="outline">
            Save date
          </SubmitButton>
        </div>

        {!state.ok ? <FormError message={state.error} /> : null}
      </form>
    </li>
  );
}

/**
 * Expiry lives on the batch, not the product: one item routinely sits on the
 * shelf as several boxes with different dates. So this offers one field per
 * batch rather than a single field for the product, which would have to
 * overwrite every box with the same date.
 */
export function ExpiryEditor({
  batches,
  baseUnit,
}: {
  batches: EditableBatch[];
  baseUnit: string;
}) {
  const unverified = batches.filter((b) => b.unverified).length;

  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3.5">
        <h2 className="flex items-center gap-2 font-medium">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          Expiry dates
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {batches.length === 0
            ? "No stock on hand. Expiry dates are recorded when stock is received."
            : unverified > 0
              ? `${unverified} of ${batches.length} still ${unverified === 1 ? "has a placeholder date" : "have placeholder dates"} from the import.`
              : `${batches.length} ${batches.length === 1 ? "batch" : "batches"} on hand. Each box has its own date.`}
        </p>
      </header>

      {batches.length > 0 ? (
        <ul className="divide-y">
          {batches.map((b) => (
            <BatchExpiryRow key={b.id} batch={b} baseUnit={baseUnit} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
