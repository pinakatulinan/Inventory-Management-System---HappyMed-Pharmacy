"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleCheck, PackagePlus } from "lucide-react";

import {
  receiveStockAction,
  type ReceiveResult,
} from "@/app/(app)/receive/actions";
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
import { useAction } from "@/components/form/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const STEP_TITLES = ["Which item?", "How many?", "When does it expire?", "Check and save"];

const selectClass =
  "h-12 w-full rounded-lg border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Expiry printed as month/year means the last day of that month. */
function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function ReceiveWizard({
  products,
  currency,
  costKnownIds,
  defaultProductId,
}: {
  products: PickerProduct[];
  currency: string;
  /** Products that have a previous price, so cost need not be asked. */
  costKnownIds: string[];
  defaultProductId?: string;
}) {
  const initial = products.find((p) => p.id === defaultProductId) ?? null;

  const [step, setStep] = useState(initial ? 2 : 1);
  const [product, setProduct] = useState<PickerProduct | null>(initial);
  const [amount, setAmount] = useState(0);
  const [unit, setUnit] = useState<QuantityUnit>(
    initial?.packUnit && initial.unitsPerPack > 1 ? "pack" : "base",
  );
  const [month, setMonth] = useState(0);
  const [year, setYear] = useState(0);
  const [lot, setLot] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<ReceiveResult | null>(null);
  const [round, setRound] = useState(0);

  const [state, formAction] = useAction<ReceiveResult>(receiveStockAction, {
    toastOnSuccess: false,
    onSuccess: (data) => {
      if (data) setDone(data);
    },
  });

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => thisYear + i);

  const quantity = product ? quantityInBaseUnits(product, amount, unit) : 0;
  const expiry = month && year ? lastDayOfMonth(year, month) : "";
  const expiryPassed = expiry !== "" && expiry < new Date().toISOString().slice(0, 10);
  const needsCost = product ? !costKnownIds.includes(product.id) : false;

  const canContinue =
    (step === 1 && product !== null) ||
    (step === 2 && quantity > 0) ||
    (step === 3 && expiry !== "" && !expiryPassed);

  const startOver = () => {
    setDone(null);
    setProduct(null);
    setAmount(0);
    setMonth(0);
    setYear(0);
    setLot("");
    setCost("");
    setNotes("");
    setStep(1);
    setRound((r) => r + 1);
  };

  const choose = (next: PickerProduct | null) => {
    setProduct(next);
    setAmount(0);
    setUnit(next?.packUnit && next.unitsPerPack > 1 ? "pack" : "base");
  };

  if (done) {
    return (
      <div className="space-y-6 rounded-xl border border-status-ok-border bg-status-ok-soft p-6 text-status-ok">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-8 shrink-0" aria-hidden />
          <div>
            <p className="text-lg font-semibold">Saved!</p>
            <p className="text-sm tabular">
              Lot <span className="font-mono">{done.lotNumber}</span> now has{" "}
              {done.balanceAfter.toLocaleString()} in stock.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={startOver} size="lg" className="h-12 text-base">
            Receive another
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 bg-background text-base text-foreground">
            <Link href={`/products/${done.productId}`}>See this item</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-6"
      onKeyDown={(e) => {
        // Enter must move to the next step, not submit a half-finished delivery.
        if (e.key === "Enter" && step < 4 && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          if (canContinue) setStep(step + 1);
        }
      }}
    >
      {/* Everything is posted from here, whichever step is showing. */}
      <input type="hidden" name="productId" value={product?.id ?? ""} />
      <input type="hidden" name="packs" value={unit === "pack" ? amount : 0} />
      <input type="hidden" name="looseUnits" value={unit === "base" ? amount : 0} />
      <input type="hidden" name="expiryDate" value={expiry} />
      <input type="hidden" name="lotNumber" value={lot} />
      <input type="hidden" name="costPerUnit" value={cost} />
      <input type="hidden" name="notes" value={notes} />

      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Step {step} of 4
        </p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={
                n <= step
                  ? "h-1.5 flex-1 rounded-full bg-primary"
                  : "h-1.5 flex-1 rounded-full bg-muted"
              }
            />
          ))}
        </div>
        <h2 className="mt-3 text-xl font-semibold">{STEP_TITLES[step - 1]}</h2>
      </div>

      <div className="space-y-6 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        {step === 1 ? (
          <ProductPicker
            key={round}
            products={products}
            name="_product"
            label="Search by brand, generic name or code"
            defaultProductId={product?.id}
            onSelect={choose}
          />
        ) : null}

        {step === 2 && product ? (
          <>
            <p className="font-medium">
              {product.brandName ?? product.genericName}
              <span className="font-normal text-muted-foreground">
                {product.strength ? ` · ${product.strength}` : ""}
              </span>
            </p>
            <QuantityInput
              product={product}
              amount={amount}
              unit={unit}
              postValues={false}
              label="How much arrived?"
              onChange={(next) => {
                setAmount(next.amount);
                setUnit(next.unit);
              }}
              error={state.ok ? undefined : state.fieldErrors?.packs}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Look at the expiry date printed on the box. If it shows only a
              month and year, choose those.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="expiry-month">Month</Label>
                <select
                  id="expiry-month"
                  className={selectClass}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  <option value={0}>Choose...</option>
                  {MONTHS.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiry-year">Year</Label>
                <select
                  id="expiry-year"
                  className={selectClass}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  <option value={0}>Choose...</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {expiryPassed ? (
              <p className="text-sm font-medium text-status-expired">
                That date has already passed. Check the box again.
              </p>
            ) : null}
          </>
        ) : null}

        {step === 4 && product ? (
          <>
            <dl className="divide-y rounded-lg border text-sm">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">Item</dt>
                <dd className="text-right font-medium">
                  {product.brandName ?? product.genericName}
                  {product.strength ? ` · ${product.strength}` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">Arrived</dt>
                <dd className="text-right font-medium tabular">
                  {quantity.toLocaleString()} {product.baseUnit}
                  {unit === "pack" && product.packUnit ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {amount} {product.packUnit}
                      {amount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">Expires</dt>
                <dd className="text-right font-medium">
                  {MONTHS[month - 1]} {year}
                </dd>
              </div>
            </dl>

            {needsCost ? (
              <div className="space-y-2">
                <Label htmlFor="wizard-cost">
                  First time receiving this: cost per {product.baseUnit} (
                  {currency})
                </Label>
                <Input
                  id="wizard-cost"
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min={0}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="h-12 text-base"
                  aria-invalid={
                    state.ok ? undefined : Boolean(state.fieldErrors?.costPerUnit)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  What you paid, not the selling price.
                </p>
              </div>
            ) : null}

            <details className="rounded-lg border px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">
                More details (optional)
              </summary>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wizard-lot">Lot number</Label>
                  <Input
                    id="wizard-lot"
                    value={lot}
                    onChange={(e) => setLot(e.target.value)}
                    className="h-11 font-mono"
                    autoComplete="off"
                    placeholder="Leave blank to fill in automatically"
                  />
                </div>

                {!needsCost ? (
                  <div className="space-y-2">
                    <Label htmlFor="wizard-cost-opt">
                      Cost per {product.baseUnit} ({currency})
                    </Label>
                    <Input
                      id="wizard-cost-opt"
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      min={0}
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      className="h-11"
                      placeholder="Leave blank to use the last price"
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="wizard-notes">Notes</Label>
                  <Textarea
                    id="wizard-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Invoice number, damaged boxes, anything worth remembering"
                  />
                </div>
              </div>
            </details>

            {!state.ok ? <FormError message={state.error} /> : null}
          </>
        ) : null}
      </div>

      <div className="flex gap-3">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-14 flex-1 text-base"
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft aria-hidden />
            Back
          </Button>
        ) : null}

        {step < 4 ? (
          <Button
            type="button"
            size="lg"
            className="h-14 flex-[2] text-base"
            disabled={!canContinue}
            onClick={() => setStep(step + 1)}
          >
            Next
            <ArrowRight aria-hidden />
          </Button>
        ) : (
          <SubmitButton
            pendingLabel="Saving..."
            size="lg"
            className="h-14 flex-[2] text-base"
            disabled={needsCost && cost.trim() === ""}
          >
            <PackagePlus aria-hidden />
            Save delivery
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
