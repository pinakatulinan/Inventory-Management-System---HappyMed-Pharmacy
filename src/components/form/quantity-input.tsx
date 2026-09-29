"use client";

import { Minus, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toBaseUnits } from "@/lib/units";
import { cn } from "@/lib/utils";

export type QuantityUnit = "pack" | "base";

export interface QuantityProduct {
  baseUnit: string;
  packUnit: string | null;
  unitsPerPack: number;
}

/** Whether the product can be counted in packs at all. */
export function hasPacks(product: QuantityProduct): boolean {
  return Boolean(product.packUnit) && product.unitsPerPack > 1;
}

/** The quantity in base units, which is what the ledger stores. */
export function quantityInBaseUnits(
  product: QuantityProduct,
  amount: number,
  unit: QuantityUnit,
): number {
  if (unit === "pack" && hasPacks(product)) {
    return toBaseUnits(amount, 0, product.unitsPerPack);
  }
  return toBaseUnits(0, amount, product.unitsPerPack);
}

/**
 * One number and a unit toggle, in place of separate "packs" and "loose" boxes.
 *
 * It still posts `packs` and `looseUnits`, so the server actions do not change:
 * whichever unit is selected fills one of them and the other is zero.
 */
export function QuantityInput({
  product,
  amount,
  unit,
  onChange,
  label = "How many?",
  error,
  postValues = true,
}: {
  product: QuantityProduct;
  amount: number;
  unit: QuantityUnit;
  onChange: (next: { amount: number; unit: QuantityUnit }) => void;
  label?: string;
  error?: string;
  /** Set false when the parent form posts `packs`/`looseUnits` itself. */
  postValues?: boolean;
}) {
  const packable = hasPacks(product);
  const activeUnit: QuantityUnit = packable ? unit : "base";
  const unitName =
    activeUnit === "pack" ? (product.packUnit ?? "pack") : product.baseUnit;

  const set = (next: number) =>
    onChange({ amount: Math.max(0, next), unit: activeUnit });

  return (
    <div className="space-y-2">
      <Label htmlFor="quantity-amount">{label}</Label>

      {postValues ? (
        <>
          <input
            type="hidden"
            name="packs"
            value={activeUnit === "pack" ? amount : 0}
          />
          <input
            type="hidden"
            name="looseUnits"
            value={activeUnit === "base" ? amount : 0}
          />
        </>
      ) : null}

      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => set(amount - 1)}
          disabled={amount <= 0}
          className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-background hover:bg-accent disabled:opacity-40"
        >
          <Minus className="size-5" aria-hidden />
          <span className="sr-only">One less</span>
        </button>

        <Input
          id="quantity-amount"
          type="number"
          inputMode="numeric"
          min={0}
          value={amount || ""}
          placeholder="0"
          onChange={(e) => set(Number.parseInt(e.target.value, 10) || 0)}
          aria-invalid={Boolean(error)}
          className="h-12 min-w-0 flex-1 text-center text-xl font-semibold tabular"
        />

        <button
          type="button"
          onClick={() => set(amount + 1)}
          className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-background hover:bg-accent"
        >
          <Plus className="size-5" aria-hidden />
          <span className="sr-only">One more</span>
        </button>
      </div>

      {packable ? (
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Unit"
        >
          {(["pack", "base"] as const).map((option) => {
            const selected = activeUnit === option;
            const name =
              option === "pack" ? (product.packUnit ?? "pack") : product.baseUnit;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ amount, unit: option })}
                className={cn(
                  "min-h-12 rounded-lg border px-3 py-2 text-left text-sm",
                  selected
                    ? "border-primary bg-accent font-semibold text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                <span className="block capitalize">{name}s</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {option === "pack"
                    ? `${product.unitsPerPack} ${product.baseUnit} each`
                    : "Singles"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {amount > 0 && packable && activeUnit === "pack" ? (
        <p className="text-sm text-muted-foreground tabular">
          {amount} {unitName}
          {amount === 1 ? "" : "s"} ={" "}
          {quantityInBaseUnits(product, amount, activeUnit).toLocaleString()}{" "}
          {product.baseUnit}
        </p>
      ) : null}

      {error ? (
        <p className="text-xs font-medium text-status-expired">{error}</p>
      ) : null}
    </div>
  );
}
