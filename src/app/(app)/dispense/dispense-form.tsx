"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CircleCheck, HandCoins, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  dispenseAction,
  getAvailableBatchesAction,
  type AvailableBatch,
  type DispenseResult,
} from "@/app/(app)/dispense/actions";
import {
  Field,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/form/form-parts";
import {
  ProductPicker,
  type PickerProduct,
} from "@/components/form/product-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/form/use-action";
import { classifyExpiry, formatDaysLeft, type ExpiryThresholds } from "@/lib/expiry";
import { toBaseUnits } from "@/lib/units";
import { cn } from "@/lib/utils";

interface PlannedAllocation {
  batch: AvailableBatch;
  take: number;
}

/**
 * Plan the allocation exactly the way the server will: soonest-expiring first,
 * taking as much as each batch holds before moving on. Showing the wrong lots
 * here would be worse than showing none, because staff pick the physical carton
 * off the shelf from this list.
 */
export function planFEFO(batches: AvailableBatch[], quantity: number): PlannedAllocation[] {
  const plan: PlannedAllocation[] = [];
  let remaining = quantity;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantityOnHand);
    plan.push({ batch, take });
    remaining -= take;
  }

  return plan;
}

export function DispenseForm({
  products,
  thresholds,
}: {
  products: PickerProduct[];
  thresholds: ExpiryThresholds;
}) {
  const [product, setProduct] = useState<PickerProduct | null>(null);
  const [batches, setBatches] = useState<AvailableBatch[]>([]);
  const [loadingBatches, startLoading] = useTransition();
  const [packs, setPacks] = useState(0);
  const [loose, setLoose] = useState(0);
  const [override, setOverride] = useState(false);
  const [overrideBatchId, setOverrideBatchId] = useState("");
  const [lastResult, setLastResult] = useState<DispenseResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const refreshBatches = () => {
    if (!product) return;
    startLoading(async () => {
      const result = await getAvailableBatchesAction(product.id);
      if (result.ok && result.data) setBatches(result.data);
    });
  };

  const loadBatches = (next: PickerProduct | null) => {
    setProduct(next);
    setBatches([]);
    setOverride(false);
    setOverrideBatchId("");
    setPacks(0);
    setLoose(0);

    if (!next) return;

    startLoading(async () => {
      const result = await getAvailableBatchesAction(next.id);
      if (result.ok && result.data) setBatches(result.data);
      else if (!result.ok) toast.error(result.error);
    });
  };

  const [state, formAction] = useAction<DispenseResult>(dispenseAction, {
    onSuccess: (data) => {
      if (data) setLastResult(data);
      formRef.current?.reset();
      setPacks(0);
      setLoose(0);
      setOverride(false);
      setOverrideBatchId("");
      // Availability just changed, so re-read it for the next dispense.
      void refreshBatches();
    },
  });

  const err = (n: string) => (state.ok ? undefined : state.fieldErrors?.[n]);

  const unitsPerPack = product?.unitsPerPack ?? 1;
  const baseUnit = product?.baseUnit ?? "units";
  const packUnit = product?.packUnit ?? "pack";
  const quantity = toBaseUnits(packs, loose, unitsPerPack);

  const available = useMemo(
    () => batches.reduce((n, b) => n + b.quantityOnHand, 0),
    [batches],
  );

  const plan = useMemo(
    () => (quantity > 0 ? planFEFO(batches, quantity) : []),
    [batches, quantity],
  );

  const shortfall = quantity - available;

  return (
    <div className="space-y-6">
      {lastResult ? (
        <div className="rounded-lg border border-status-ok-border bg-status-ok-soft px-4 py-3 text-sm text-status-ok">
          <p className="flex items-center gap-2 font-medium">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            Dispensed {lastResult.totalQuantity} units
          </p>
          <ul className="mt-1.5 space-y-0.5 pl-6">
            {lastResult.allocations.map((a) => (
              <li key={a.lotNumber} className="tabular">
                <span className="font-mono">{a.lotNumber}</span>: -{a.quantity}{" "}
                &rarr; {a.balanceAfter} left
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-6">
        <div className="space-y-8 rounded-xl border bg-card p-6 shadow-xs">
          <FormSection title="What is going out">
            <ProductPicker
              products={products}
              onSelect={loadBatches}
              error={err("productId")}
            />

            {product ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="packs"
                  label={`${packUnit.charAt(0).toUpperCase()}${packUnit.slice(1)}s`}
                  error={err("packs")}
                  hint={`${unitsPerPack} ${baseUnit} each`}
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min={0}
                      value={packs || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setPacks(Number.parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                </Field>

                <Field
                  name="looseUnits"
                  label={`Loose ${baseUnit}`}
                  error={err("looseUnits")}
                  hint="Singles out of an opened pack"
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min={0}
                      value={loose || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setLoose(Number.parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                </Field>
              </div>
            ) : null}
          </FormSection>

          {product ? (
            <FormSection
              title="Batch allocation"
              description="First-expired-first-out. Take the cartons listed here off the shelf."
            >
              {loadingBatches ? (
                <p className="text-sm text-muted-foreground">
                  Checking available stock...
                </p>
              ) : batches.length === 0 ? (
                <div className="flex items-start gap-2.5 rounded-md border border-status-expired-border bg-status-expired-soft px-3 py-2.5 text-sm text-status-expired">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>
                    No dispensable stock. Every batch is either empty, expired or
                    quarantined.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground tabular">
                    {available.toLocaleString()} {baseUnit} available across{" "}
                    {batches.length} lot{batches.length === 1 ? "" : "s"}.
                  </p>

                  {quantity > 0 && shortfall > 0 ? (
                    <div className="flex items-start gap-2.5 rounded-md border border-status-expired-border bg-status-expired-soft px-3 py-2.5 text-sm text-status-expired">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <p>
                        Short by <strong className="tabular">{shortfall}</strong>{" "}
                        {baseUnit}. Reduce the quantity or receive more stock.
                      </p>
                    </div>
                  ) : null}

                  {plan.length > 0 && shortfall <= 0 && !override ? (
                    <ul className="divide-y rounded-lg border" aria-live="polite">
                      {plan.map(({ batch, take }) => {
                        const status = classifyExpiry(batch.daysLeft, thresholds);
                        return (
                          <li
                            key={batch.id}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-mono font-medium">
                                {batch.lotNumber}
                              </p>
                              <p
                                className={cn(
                                  "text-xs",
                                  status === "CRITICAL" || status === "EXPIRED"
                                    ? "text-status-critical"
                                    : "text-muted-foreground",
                                )}
                              >
                                {batch.expiryDate} &middot;{" "}
                                {formatDaysLeft(batch.daysLeft)}
                              </p>
                            </div>
                            <p className="shrink-0 tabular">
                              <strong>-{take}</strong>{" "}
                              <span className="text-muted-foreground">
                                of {batch.quantityOnHand}
                              </span>
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  <div className="flex items-start gap-3 pt-1">
                    <Checkbox
                      id="override"
                      checked={override}
                      onCheckedChange={(v) => {
                        setOverride(v === true);
                        if (v !== true) setOverrideBatchId("");
                      }}
                    />
                    <div>
                      <Label htmlFor="override" className="font-normal">
                        Dispense from a specific batch instead
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Overrides FEFO. Requires a reason, and is recorded in the
                        audit log.
                      </p>
                    </div>
                  </div>

                  {override ? (
                    <div className="space-y-2">
                      <input
                        type="hidden"
                        name="overrideBatchId"
                        value={overrideBatchId}
                      />
                      <ul className="divide-y rounded-lg border">
                        {batches.map((batch) => (
                          <li key={batch.id}>
                            <button
                              type="button"
                              onClick={() => setOverrideBatchId(batch.id)}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm",
                                overrideBatchId === batch.id
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent/50",
                              )}
                            >
                              <span>
                                <span className="block font-mono font-medium">
                                  {batch.lotNumber}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {batch.expiryDate} &middot;{" "}
                                  {formatDaysLeft(batch.daysLeft)}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs tabular">
                                {batch.quantityOnHand} available
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </FormSection>
          ) : null}

          {product ? (
            <FormSection title="Record">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="reference"
                  label="Reference"
                  error={err("reference")}
                  hint="Prescription or receipt number, if there is one."
                >
                  {(props) => <Input {...props} autoComplete="off" />}
                </Field>

                <Field
                  name="reason"
                  label={override ? "Reason for override" : "Note"}
                  required={override}
                  error={err("reason")}
                  hint={
                    override
                      ? "Why this batch instead of the soonest-expiring one?"
                      : "Optional."
                  }
                >
                  {(props) => <Textarea {...props} rows={2} />}
                </Field>
              </div>
            </FormSection>
          ) : null}

          {!state.ok ? <FormError message={state.error} /> : null}
        </div>

        <div className="flex justify-end">
          <SubmitButton
            pendingLabel="Dispensing..."
            disabled={
              !product ||
              quantity <= 0 ||
              batches.length === 0 ||
              (!override && shortfall > 0) ||
              (override && !overrideBatchId)
            }
          >
            <HandCoins aria-hidden />
            Dispense {quantity > 0 ? `${quantity} ${baseUnit}` : ""}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
