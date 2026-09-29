"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, HandCoins, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  dispenseAction,
  getAvailableBatchesAction,
  type AvailableBatch,
  type DispenseResult,
} from "@/app/(app)/dispense/actions";
import { planFEFO } from "@/app/(app)/dispense/dispense-form";
import { FormError, SubmitButton } from "@/components/form/form-parts";
import {
  ProductPicker,
  type PickerProduct,
} from "@/components/form/product-picker";
import {
  QuantityInput,
  quantityInBaseUnits,
  type QuantityUnit,
} from "@/components/form/quantity-input";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/form/use-action";
import { formatDaysLeft } from "@/lib/expiry";

export function SimpleDispenseForm({
  products,
  showAdvancedLink,
}: {
  products: PickerProduct[];
  showAdvancedLink: boolean;
}) {
  const [product, setProduct] = useState<PickerProduct | null>(null);
  const [batches, setBatches] = useState<AvailableBatch[]>([]);
  const [loading, startLoading] = useTransition();
  const [amount, setAmount] = useState(0);
  const [unit, setUnit] = useState<QuantityUnit>("pack");
  const [done, setDone] = useState<DispenseResult | null>(null);
  // Changing the key remounts the picker, which is how it gets cleared.
  const [round, setRound] = useState(0);

  const load = (next: PickerProduct | null) => {
    setProduct(next);
    setBatches([]);
    setAmount(0);
    setUnit(next?.packUnit && next.unitsPerPack > 1 ? "pack" : "base");
    if (!next) return;

    startLoading(async () => {
      const result = await getAvailableBatchesAction(next.id);
      if (result.ok && result.data) setBatches(result.data);
      else if (!result.ok) toast.error(result.error);
    });
  };

  const reset = () => {
    setDone(null);
    setRound((r) => r + 1);
    load(null);
  };

  const [state, formAction] = useAction<DispenseResult>(dispenseAction, {
    toastOnSuccess: false,
    onSuccess: (data) => {
      if (data) setDone(data);
    },
  });

  const quantity = product ? quantityInBaseUnits(product, amount, unit) : 0;
  const available = useMemo(
    () => batches.reduce((n, b) => n + b.quantityOnHand, 0),
    [batches],
  );
  const shortfall = quantity - available;
  const plan = useMemo(
    () => (quantity > 0 && shortfall <= 0 ? planFEFO(batches, quantity) : []),
    [batches, quantity, shortfall],
  );

  if (done) {
    return (
      <div className="space-y-6 rounded-xl border border-status-ok-border bg-status-ok-soft p-6 text-status-ok">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-8 shrink-0" aria-hidden />
          <div>
            <p className="text-lg font-semibold">Done!</p>
            <p className="text-sm">
              {done.totalQuantity.toLocaleString()} taken out of stock.
            </p>
          </div>
        </div>

        <ul className="space-y-1 text-sm tabular">
          {done.allocations.map((a) => (
            <li key={a.lotNumber}>
              Lot <span className="font-mono">{a.lotNumber}</span>: {a.balanceAfter}{" "}
              left
            </li>
          ))}
        </ul>

        <Button onClick={reset} size="lg" className="h-12 w-full text-base">
          Dispense something else
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-6 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <ProductPicker
          key={round}
          products={products}
          label="1. What item?"
          onSelect={load}
          error={state.ok ? undefined : state.fieldErrors?.productId}
        />

        {product ? (
          <>
            {loading ? (
              <p className="text-sm text-muted-foreground">Checking stock...</p>
            ) : batches.length === 0 ? (
              <div className="flex items-start gap-2.5 rounded-md border border-status-expired-border bg-status-expired-soft px-3 py-2.5 text-sm text-status-expired">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  None available to give out. It is out of stock, expired or on
                  hold.
                </p>
              </div>
            ) : (
              <>
                <QuantityInput
                  product={product}
                  amount={amount}
                  unit={unit}
                  label="2. How many?"
                  onChange={(next) => {
                    setAmount(next.amount);
                    setUnit(next.unit);
                  }}
                  error={state.ok ? undefined : state.fieldErrors?.packs}
                />

                <p className="text-sm text-muted-foreground tabular">
                  {available.toLocaleString()} {product.baseUnit} in stock.
                </p>

                {quantity > 0 && shortfall > 0 ? (
                  <div className="flex items-start gap-2.5 rounded-md border border-status-expired-border bg-status-expired-soft px-3 py-2.5 text-sm text-status-expired">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p>
                      Not enough stock. Only {available.toLocaleString()}{" "}
                      {product.baseUnit} left, so {shortfall.toLocaleString()}{" "}
                      too many.
                    </p>
                  </div>
                ) : null}

                {plan.length > 0 ? (
                  <div
                    className="rounded-lg border bg-muted/50 px-4 py-3 text-sm"
                    aria-live="polite"
                  >
                    <p className="font-medium">Take from:</p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {plan.map(({ batch, take }) => (
                        <li key={batch.id} className="tabular">
                          <span className="font-mono text-foreground">
                            {batch.lotNumber}
                          </span>{" "}
                          &middot; {take.toLocaleString()} {product.baseUnit}{" "}
                          &middot; expires {batch.expiryDate} (
                          {formatDaysLeft(batch.daysLeft)})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {!state.ok ? <FormError message={state.error} /> : null}
      </div>

      <SubmitButton
        pendingLabel="Saving..."
        size="lg"
        className="h-14 w-full text-base"
        disabled={!product || quantity <= 0 || batches.length === 0 || shortfall > 0}
      >
        <HandCoins aria-hidden />
        {quantity > 0 && product
          ? `Give out ${quantity.toLocaleString()} ${product.baseUnit}`
          : "Give out"}
      </SubmitButton>

      {showAdvancedLink ? (
        <p className="text-center text-sm text-muted-foreground">
          Need to pick a specific batch?{" "}
          <Link href="/dispense/advanced" className="font-medium underline">
            Advanced dispensing
          </Link>
        </p>
      ) : null}
    </form>
  );
}
