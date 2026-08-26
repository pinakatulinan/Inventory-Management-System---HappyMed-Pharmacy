"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, PackagePlus } from "lucide-react";

import {
  receiveStockAction,
  type ReceiveResult,
} from "@/app/(app)/receive/actions";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/form/use-action";
import { toBaseUnits } from "@/lib/units";

export function ReceiveForm({
  products,
  currency,
  defaultProductId,
}: {
  products: PickerProduct[];
  currency: string;
  defaultProductId?: string;
}) {
  const [product, setProduct] = useState<PickerProduct | null>(
    () => products.find((p) => p.id === defaultProductId) ?? null,
  );
  const [packs, setPacks] = useState(0);
  const [loose, setLoose] = useState(0);
  const [lastReceipt, setLastReceipt] = useState<ReceiveResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction] = useAction<ReceiveResult>(receiveStockAction, {
    onSuccess: (data) => {
      if (data) setLastReceipt(data);
      // A delivery is many lines; reset for the next one rather than making
      // them navigate back and forth.
      formRef.current?.reset();
      setPacks(0);
      setLoose(0);
    },
  });

  const err = (n: string) => (state.ok ? undefined : state.fieldErrors?.[n]);

  const unitsPerPack = product?.unitsPerPack ?? 1;
  const baseUnit = product?.baseUnit ?? "units";
  const packUnit = product?.packUnit ?? "pack";
  const total = toBaseUnits(packs, loose, unitsPerPack);

  return (
    <div className="space-y-6">
      {lastReceipt ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-status-ok-border bg-status-ok-soft px-4 py-3 text-sm text-status-ok">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Lot <span className="font-mono">{lastReceipt.lotNumber}</span> now
            holds{" "}
            <strong className="tabular">{lastReceipt.balanceAfter}</strong>{" "}
            units.{" "}
            <Link
              href={`/products/${lastReceipt.productId}`}
              className="font-medium underline"
            >
              View product
            </Link>
          </p>
        </div>
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-6">
        <div className="space-y-8 rounded-xl border bg-card p-6 shadow-xs">
          <FormSection
            title="What arrived"
            description="Each carton with its own lot number and expiry date is a separate batch."
          >
            <ProductPicker
              products={products}
              defaultProductId={defaultProductId}
              onSelect={setProduct}
              error={err("productId")}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="lotNumber"
                label="Lot / batch number"
                required
                error={err("lotNumber")}
                hint="Exactly as printed on the carton."
              >
                {(props) => (
                  <Input
                    {...props}
                    className="font-mono"
                    autoComplete="off"
                    required
                  />
                )}
              </Field>

              <Field
                name="expiryDate"
                label="Expiry date"
                required
                error={err("expiryDate")}
                hint="If only month and year are printed, use the last day of that month."
              >
                {(props) => <Input {...props} type="date" required />}
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="How much"
            description={`Stock is stored as a count of ${baseUnit}. Enter whole ${packUnit}s and any loose ${baseUnit} separately.`}
          >
            <div className="grid gap-4 sm:grid-cols-3">
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
                hint="Part-packs or singles"
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

              <Field
                name="costPerUnit"
                label={`Cost per ${baseUnit} (${currency})`}
                required
                error={err("costPerUnit")}
                hint="What you paid, not the selling price."
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    step="0.0001"
                    min={0}
                    required
                  />
                )}
              </Field>
            </div>

            <p
              className="rounded-md bg-muted px-3 py-2 text-sm"
              aria-live="polite"
            >
              Receiving{" "}
              <strong className="tabular">{total.toLocaleString()}</strong>{" "}
              {baseUnit}
              {packs > 0 && unitsPerPack > 1 ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({packs} x {unitsPerPack}
                  {loose > 0 ? ` + ${loose}` : ""})
                </span>
              ) : null}
            </p>
          </FormSection>

          <FormSection title="Notes">
            <Field
              name="notes"
              label="Delivery notes"
              error={err("notes")}
              hint="Invoice number, condition on arrival, anything worth recording."
            >
              {(props) => <Textarea {...props} rows={2} />}
            </Field>
          </FormSection>

          {!state.ok ? <FormError message={state.error} /> : null}
        </div>

        <div className="flex justify-end">
          <SubmitButton pendingLabel="Recording..." disabled={!product || total <= 0}>
            <PackagePlus aria-hidden />
            Record delivery
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
