"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { setProductActiveAction } from "@/app/(app)/products/actions";
import { FormError, SubmitButton } from "@/components/form/form-parts";
import type { ActionResult } from "@/lib/actions";

/**
 * Separated from the main form so a discontinue is always a deliberate,
 * standalone act rather than something that rides along with an edit.
 */
export function DiscontinueProduct({
  productId,
  label,
  isActive,
}: {
  productId: string;
  label: string;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    setProductActiveAction,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form
      action={formAction}
      className="rounded-xl border border-dashed p-5"
    >
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="isActive" value={String(!isActive)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">
            {isActive ? "Discontinue this product" : "Reactivate this product"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isActive
              ? "Hides it from dispensing and new orders. All history is kept, and it can be reactivated."
              : `${label} is discontinued. Reactivate it to dispense and reorder again.`}
          </p>
        </div>

        <SubmitButton
          variant={isActive ? "destructive" : "default"}
          pendingLabel="Saving..."
        >
          {isActive ? "Discontinue" : "Reactivate"}
        </SubmitButton>
      </div>

      {!state.ok ? (
        <div className="mt-3">
          <FormError message={state.error} />
        </div>
      ) : null}
    </form>
  );
}
