"use client";

import { useState } from "react";
import Link from "next/link";

import {
  createProductAction,
  updateProductAction,
} from "@/app/(app)/products/actions";
import {
  Field,
  FormError,
  FormSection,
  FormValues,
  SubmitButton,
} from "@/components/form/form-parts";
import { useAction } from "@/components/form/use-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DosageForm, ItemType } from "@/generated/prisma/enums";
import { fromBaseUnits } from "@/lib/units";

export const DOSAGE_FORM_LABELS: Record<DosageForm, string> = {
  TABLET: "Tablet",
  CAPSULE: "Capsule",
  SYRUP: "Syrup",
  SUSPENSION: "Suspension",
  INJECTION: "Injection",
  OINTMENT: "Ointment",
  CREAM: "Cream",
  GEL: "Gel",
  DROPS: "Drops",
  INHALER: "Inhaler",
  SUPPOSITORY: "Suppository",
  PATCH: "Patch",
  POWDER: "Powder",
  SOLUTION: "Solution",
  LOZENGE: "Lozenge",
  OTHER: "Other",
};

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  MEDICINE: "Medicine",
  SUPPLEMENT: "Vitamin or supplement",
  PERSONAL_CARE: "Personal care",
  MEDICAL_SUPPLY: "Medical supply",
  OTHER: "Other item",
};

/** Sensible base unit per dosage form, offered as a suggestion only. */
const BASE_UNIT_SUGGESTION: Partial<Record<DosageForm, string>> = {
  TABLET: "tablet",
  CAPSULE: "capsule",
  SYRUP: "mL",
  SUSPENSION: "mL",
  SOLUTION: "mL",
  DROPS: "mL",
  INJECTION: "vial",
  INHALER: "inhaler",
  CREAM: "tube",
  OINTMENT: "tube",
  GEL: "tube",
  PATCH: "patch",
  SUPPOSITORY: "suppository",
  LOZENGE: "lozenge",
  POWDER: "sachet",
};

export interface ProductFormValues {
  id: string;
  itemType: ItemType;
  sku: string;
  genericName: string;
  brandName: string | null;
  strength: string | null;
  dosageForm: DosageForm;
  description: string | null;
  categoryId: string;
  supplierId: string | null;
  baseUnit: string;
  packUnit: string | null;
  unitsPerPack: number;
  sellingPrice: string;
  reorderPoint: number;
  isRxOnly: boolean;
  requiresRefrigeration: boolean;
  hasStock: boolean;
}

export function ProductForm({
  product,
  categories,
  suppliers,
  currency,
}: {
  product?: ProductFormValues;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  currency: string;
}) {
  const isEdit = Boolean(product);
  const [state, formAction, submitted] = useAction(
    isEdit ? updateProductAction : createProductAction,
  );

  const [itemType, setItemType] = useState<ItemType>(
    product?.itemType ?? "MEDICINE",
  );
  const isMedicine = itemType === "MEDICINE";

  const [dosageForm, setDosageForm] = useState<DosageForm>(
    product?.dosageForm ?? "TABLET",
  );
  const [baseUnit, setBaseUnit] = useState(product?.baseUnit ?? "tablet");
  const [packUnit, setPackUnit] = useState(product?.packUnit ?? "box");
  const [unitsPerPack, setUnitsPerPack] = useState(product?.unitsPerPack ?? 1);
  const [reorderPoint, setReorderPoint] = useState(product?.reorderPoint ?? 0);

  const err = (name: string) => (state.ok ? undefined : state.fieldErrors?.[name]);

  // A checkbox posts nothing when unticked, so "absent from the submitted
  // values" only means unticked once there has actually been a submission.
  const checkedValue = (name: string, stored: boolean | undefined) =>
    submitted ? submitted[name] !== undefined : Boolean(stored);

  // Only suggest a base unit while creating; changing it later is blocked once
  // stock exists, and silently rewriting it would be worse than leaving it.
  const onDosageFormChange = (value: string) => {
    const form = value as DosageForm;
    setDosageForm(form);
    if (!isEdit) {
      setBaseUnit(BASE_UNIT_SUGGESTION[form] ?? "piece");
    }
  };

  const onItemTypeChange = (value: string) => {
    const next = value as ItemType;
    setItemType(next);
    if (isEdit) return;
    setBaseUnit(
      next === "MEDICINE" ? (BASE_UNIT_SUGGESTION[dosageForm] ?? "piece") : "piece",
    );
  };

  const reorderPreview =
    unitsPerPack > 1 && reorderPoint > 0
      ? fromBaseUnits(reorderPoint, unitsPerPack)
      : null;

  return (
    <FormValues values={submitted}>
      <form action={formAction} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" value={product!.id} /> : null}

      <div className="space-y-8 rounded-xl border bg-card p-6 shadow-xs">
        <FormSection
          title="Identity"
          description="How this item is named and found."
        >
          <Field name="itemType" label="What kind of item is it?" required>
            {(props) => (
              <Select
                name={props.name}
                value={itemType}
                onValueChange={onItemTypeChange}
              >
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="genericName"
              defaultValue={product?.genericName}
              label={isMedicine ? "Generic name" : "Item name"}
              required
              error={err("genericName")}
              hint={
                isMedicine
                  ? "The active ingredient, e.g. Paracetamol."
                  : "What it is, e.g. Alcohol 70%, Face mask, Vitamin C."
              }
            >
              {(props) => (
                <Input {...props} required />
              )}
            </Field>

            <Field
              name="brandName"
              defaultValue={product?.brandName ?? ""}
              label="Brand name"
              error={err("brandName")}
              hint={
                isMedicine
                  ? "What is printed on the box, e.g. Biogesic."
                  : "The maker or label on the package, if any."
              }
            >
              {(props) => (
                <Input {...props} />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="sku"
              defaultValue={product?.sku}
              label="Stock code"
              required
              error={err("sku")}
              hint="Your own reference, e.g. PAR-500-TAB."
            >
              {(props) => (
                <Input
                  {...props}
                  className="font-mono uppercase"
                  required
                />
              )}
            </Field>

            <Field
              name="strength"
              defaultValue={product?.strength ?? ""}
              label={isMedicine ? "Strength" : "Size"}
              error={err("strength")}
              hint={isMedicine ? "e.g. 500mg, 125mg/5mL." : "e.g. 500mL, Large, 50 pcs."}
            >
              {(props) => (
                <Input {...props} />
              )}
            </Field>

            {isMedicine ? (
              <Field name="dosageForm" label="Form" required error={err("dosageForm")}>
                {(props) => (
                  <Select
                    name={props.name}
                    value={dosageForm}
                    onValueChange={onDosageFormChange}
                  >
                    <SelectTrigger id={props.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOSAGE_FORM_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            ) : (
              <input type="hidden" name="dosageForm" value="OTHER" />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="categoryId"
              defaultValue={product?.categoryId}
              label="Category"
              required
              error={err("categoryId")}
            >
              {(props) => (
                <Select name={props.name} defaultValue={props.defaultValue}>
                  <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              name="supplierId"
              defaultValue={product?.supplierId ?? "none"}
              label="Default supplier"
              error={err("supplierId")}
              hint="Used to pre-fill purchase orders."
            >
              {(props) => (
                <Select
                  name={props.name}
                  defaultValue={props.defaultValue}
                >
                  <SelectTrigger id={props.id}>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default supplier</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

          <Field name="description" defaultValue={product?.description ?? ""} label="Notes" error={err("description")}>
            {(props) => (
              <Textarea
                {...props}
                rows={2}
              />
            )}
          </Field>
        </FormSection>

        <FormSection
          title="Units"
          description="All stock is counted in base units. Packs are only for entering and reading quantities."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="baseUnit"
              label="Base unit"
              required
              error={err("baseUnit")}
              hint={
                product?.hasStock
                  ? "Locked: stock already recorded in this unit."
                  : "The smallest amount you can dispense."
              }
            >
              {(props) => (
                <Input
                  {...props}
                  value={baseUnit}
                  onChange={(e) => setBaseUnit(e.target.value)}
                  readOnly={product?.hasStock}
                  className={product?.hasStock ? "bg-muted" : undefined}
                  required
                />
              )}
            </Field>

            <Field
              name="packUnit"
              label="Pack unit"
              error={err("packUnit")}
              hint="How it arrives, e.g. box."
            >
              {(props) => (
                <Input
                  {...props}
                  value={packUnit}
                  onChange={(e) => setPackUnit(e.target.value)}
                />
              )}
            </Field>

            <Field
              name="unitsPerPack"
              label={`${baseUnit || "units"} per ${packUnit || "pack"}`}
              required
              error={err("unitsPerPack")}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  value={unitsPerPack}
                  onChange={(e) =>
                    setUnitsPerPack(Number.parseInt(e.target.value, 10) || 1)
                  }
                  required
                />
              )}
            </Field>
          </div>

          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            One {packUnit || "pack"} holds{" "}
            <strong className="text-foreground tabular">{unitsPerPack}</strong>{" "}
            {baseUnit || "units"}. Stock is stored as a count of {baseUnit || "units"},
            so dispensing loose {baseUnit || "units"} is exact.
          </p>
        </FormSection>

        <FormSection title="Pricing and reordering">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="sellingPrice"
              defaultValue={product?.sellingPrice ?? "0"}
              label={`Selling price per ${baseUnit || "unit"} (${currency})`}
              required
              error={err("sellingPrice")}
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

            <Field
              name="reorderPoint"
              label={`Reorder point (${baseUnit || "units"})`}
              required
              error={err("reorderPoint")}
              hint={
                reorderPreview
                  ? `About ${reorderPreview.packs} ${packUnit || "pack"}(s)${reorderPreview.looseUnits ? ` + ${reorderPreview.looseUnits}` : ""}.`
                  : "Flagged as low stock at or below this."
              }
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  value={reorderPoint}
                  onChange={(e) =>
                    setReorderPoint(Number.parseInt(e.target.value, 10) || 0)
                  }
                  required
                />
              )}
            </Field>
          </div>
        </FormSection>

        <FormSection title="Handling">
          <div className="space-y-3">
            {isMedicine ? (
            <div className="flex items-start gap-3">
              <Checkbox
                id="isRxOnly"
                name="isRxOnly"
                defaultChecked={checkedValue("isRxOnly", product?.isRxOnly)}
                key={`rx-${submitted ? "r" : "i"}`}
              />
              <div>
                <Label htmlFor="isRxOnly" className="font-normal">
                  Prescription only
                </Label>
                <p className="text-xs text-muted-foreground">
                  Flagged at the point of dispensing.
                </p>
              </div>
            </div>
            ) : null}

            <div className="flex items-start gap-3">
              <Checkbox
                id="requiresRefrigeration"
                name="requiresRefrigeration"
                defaultChecked={checkedValue("requiresRefrigeration", product?.requiresRefrigeration)}
                key={`fridge-${submitted ? "r" : "i"}`}
              />
              <div>
                <Label htmlFor="requiresRefrigeration" className="font-normal">
                  Requires refrigeration
                </Label>
                <p className="text-xs text-muted-foreground">
                  Shown on receiving and stock screens as a cold-chain reminder.
                </p>
              </div>
            </div>
          </div>
        </FormSection>

        {!state.ok ? <FormError message={state.error} /> : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={product ? `/products/${product.id}` : "/products"}>
            Cancel
          </Link>
        </Button>
        <SubmitButton>{isEdit ? "Save changes" : "Create item"}</SubmitButton>
      </div>
      </form>
    </FormValues>
  );
}
