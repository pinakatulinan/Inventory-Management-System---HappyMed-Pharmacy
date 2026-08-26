"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createPurchaseOrderAction } from "@/app/(app)/purchase-orders/actions";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { formatMoney, toBaseUnits } from "@/lib/units";

interface Line {
  product: PickerProduct;
  packs: number;
  looseUnits: number;
  unitCost: number;
}

export interface SuggestedLine {
  productId: string;
  shortfall: number;
  lastCost: string | null;
}

export function OrderBuilder({
  products,
  suppliers,
  currency,
  locale,
  suggestions,
  defaultSupplierId,
}: {
  products: PickerProduct[];
  suppliers: { id: string; name: string }[];
  currency: string;
  locale: string;
  suggestions: SuggestedLine[];
  defaultSupplierId?: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    createPurchaseOrderAction,
    { ok: true },
  );

  const [lines, setLines] = useState<Line[]>([]);
  const [picked, setPicked] = useState<PickerProduct | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    if (!state.ok && state.error) toast.error(state.error);
  }, [state]);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const addLine = (product: PickerProduct, packs = 1, unitCost = 0) => {
    setLines((current) => {
      if (current.some((l) => l.product.id === product.id)) {
        toast.info(`${product.brandName ?? product.genericName} is already on this order.`);
        return current;
      }
      return [...current, { product, packs, looseUnits: 0, unitCost }];
    });
  };

  const addSuggestions = () => {
    for (const suggestion of suggestions) {
      const product = productById.get(suggestion.productId);
      if (!product) continue;
      // Round the shortfall up to whole packs: suppliers sell packs, not singles.
      const packs = Math.max(
        1,
        Math.ceil(suggestion.shortfall / Math.max(1, product.unitsPerPack)),
      );
      addLine(product, packs, Number(suggestion.lastCost ?? 0));
    }
  };

  const update = (index: number, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

  const remove = (index: number) =>
    setLines((current) => current.filter((_, i) => i !== index));

  const serialised = useMemo(
    () =>
      JSON.stringify(
        lines.map((l) => ({
          productId: l.product.id,
          quantityOrdered: toBaseUnits(l.packs, l.looseUnits, l.product.unitsPerPack),
          unitCost: l.unitCost,
        })),
      ),
    [lines],
  );

  const total = lines.reduce(
    (sum, l) =>
      sum + toBaseUnits(l.packs, l.looseUnits, l.product.unitsPerPack) * l.unitCost,
    0,
  );

  const hasInvalidLine = lines.some(
    (l) => toBaseUnits(l.packs, l.looseUnits, l.product.unitsPerPack) < 1,
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="lines" value={serialised} />

      <div className="space-y-8 rounded-xl border bg-card p-6 shadow-xs">
        <FormSection title="Order details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="supplierId"
              label="Supplier"
              required
              error={state.ok ? undefined : state.fieldErrors?.supplierId}
            >
              {(props) => (
                <Select name={props.name} defaultValue={defaultSupplierId}>
                  <SelectTrigger id={props.id}>
                    <SelectValue placeholder="Choose a supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              name="expectedDate"
              label="Expected delivery"
              error={state.ok ? undefined : state.fieldErrors?.expectedDate}
            >
              {(props) => <Input {...props} type="date" />}
            </Field>
          </div>

          <Field name="notes" label="Notes">
            {(props) => <Textarea {...props} rows={2} />}
          </Field>
        </FormSection>

        <FormSection
          title="Items"
          description="Quantities are entered in packs and converted to base units for the ledger."
        >
          {suggestions.length > 0 && lines.length === 0 ? (
            <div className="flex flex-col gap-2 rounded-lg border border-status-warning-border bg-status-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-status-warning">
                {suggestions.length} product
                {suggestions.length === 1 ? " is" : "s are"} at or below the
                reorder point.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={addSuggestions}>
                Add them all
              </Button>
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <ProductPicker
                key={pickerKey}
                products={products}
                name="__picker"
                label="Add a product"
                onSelect={setPicked}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!picked}
              onClick={() => {
                if (!picked) return;
                addLine(picked);
                setPicked(null);
                // Remount the picker so it returns to its search state.
                setPickerKey((k) => k + 1);
              }}
            >
              <Plus aria-hidden />
              Add
            </Button>
          </div>

          {lines.length === 0 ? (
            <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No items yet. Search for a product above.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Packs</th>
                    <th className="px-3 py-2 font-medium">Loose</th>
                    <th className="px-3 py-2 font-medium">Cost / unit</th>
                    <th className="px-3 py-2 text-right font-medium">Line total</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((line, index) => {
                    const qty = toBaseUnits(
                      line.packs,
                      line.looseUnits,
                      line.product.unitsPerPack,
                    );
                    return (
                      <tr key={line.product.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium">
                            {line.product.brandName ?? line.product.genericName}
                          </p>
                          <p className="text-xs text-muted-foreground tabular">
                            {qty} {line.product.baseUnit}
                            {line.product.unitsPerPack > 1
                              ? ` · ${line.product.unitsPerPack}/${line.product.packUnit ?? "pack"}`
                              : ""}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            value={line.packs}
                            onChange={(e) =>
                              update(index, {
                                packs: Number.parseInt(e.target.value, 10) || 0,
                              })
                            }
                            className="w-20"
                            aria-label={`Packs of ${line.product.genericName}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            value={line.looseUnits}
                            onChange={(e) =>
                              update(index, {
                                looseUnits: Number.parseInt(e.target.value, 10) || 0,
                              })
                            }
                            className="w-20"
                            aria-label={`Loose units of ${line.product.genericName}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.0001"
                            value={line.unitCost}
                            onChange={(e) =>
                              update(index, {
                                unitCost: Number.parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-28"
                            aria-label={`Unit cost of ${line.product.genericName}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular">
                          {formatMoney(qty * line.unitCost, currency, locale)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                          >
                            <Trash2 aria-hidden />
                            <span className="sr-only">
                              Remove {line.product.genericName}
                            </span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50">
                    <td colSpan={4} className="px-3 py-2 text-right font-medium">
                      Order total
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular">
                      {formatMoney(total, currency, locale)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </FormSection>

        {!state.ok ? <FormError message={state.error} /> : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href="/purchase-orders">Cancel</Link>
        </Button>
        <SubmitButton disabled={lines.length === 0 || hasInvalidLine}>
          Create order
        </SubmitButton>
      </div>
    </form>
  );
}
