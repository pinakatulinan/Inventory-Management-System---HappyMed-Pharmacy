"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  actionError,
  actionOk,
  fieldErrorsFrom,
  toActionError,
  type ActionResult,
} from "@/lib/actions";
import { diffFields, recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const DOSAGE_FORMS = [
  "TABLET",
  "CAPSULE",
  "SYRUP",
  "SUSPENSION",
  "INJECTION",
  "OINTMENT",
  "CREAM",
  "GEL",
  "DROPS",
  "INHALER",
  "SUPPOSITORY",
  "PATCH",
  "POWDER",
  "SOLUTION",
  "LOZENGE",
  "OTHER",
] as const;

const ITEM_TYPES = [
  "MEDICINE",
  "SUPPLEMENT",
  "PERSONAL_CARE",
  "MEDICAL_SUPPLY",
  "OTHER",
] as const;

const productSchema = z.object({
  itemType: z.enum(ITEM_TYPES),
  sku: z
    .string()
    .trim()
    .min(2, "Enter a stock code.")
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dots, dashes and underscores only."),
  genericName: z.string().trim().min(2, "Enter the name.").max(120),
  brandName: z.string().trim().max(120).optional().or(z.literal("")),
  strength: z.string().trim().max(60).optional().or(z.literal("")),
  dosageForm: z.enum(DOSAGE_FORMS),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  categoryId: z.string().min(1, "Choose a category."),
  supplierId: z.string().optional().or(z.literal("")),
  baseUnit: z.string().trim().min(1, "Enter the base unit.").max(30),
  packUnit: z.string().trim().max(30).optional().or(z.literal("")),
  unitsPerPack: z.coerce
    .number()
    .int("Whole units only.")
    .min(1, "Must be at least 1."),
  sellingPrice: z.coerce
    .number()
    .min(0, "Cannot be negative.")
    .max(9_999_999, "That price looks wrong."),
  reorderPoint: z.coerce
    .number()
    .int("Whole units only.")
    .min(0, "Cannot be negative."),
  isRxOnly: z.boolean(),
  requiresRefrigeration: z.boolean(),
});

function readProduct(formData: FormData) {
  const result = productSchema.safeParse({
    itemType: formData.get("itemType") ?? "MEDICINE",
    sku: formData.get("sku"),
    genericName: formData.get("genericName"),
    brandName: formData.get("brandName") ?? "",
    strength: formData.get("strength") ?? "",
    dosageForm: formData.get("dosageForm"),
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId"),
    supplierId: formData.get("supplierId") ?? "",
    baseUnit: formData.get("baseUnit"),
    packUnit: formData.get("packUnit") ?? "",
    unitsPerPack: formData.get("unitsPerPack"),
    sellingPrice: formData.get("sellingPrice"),
    reorderPoint: formData.get("reorderPoint"),
    isRxOnly: formData.get("isRxOnly") === "on",
    requiresRefrigeration: formData.get("requiresRefrigeration") === "on",
  });

  // Dosage form and prescription-only only mean something for items. Enforce
  // that here rather than trusting the form to have hidden them.
  if (result.success && result.data.itemType !== "MEDICINE") {
    result.data.dosageForm = "OTHER";
    result.data.isRxOnly = false;
  }
  return result;
}

const nullIfBlank = (v: string | undefined) =>
  v && v.trim() !== "" ? v.trim() : null;

/**
 * The supplier Select needs a non-empty value for its "no supplier" option,
 * because Radix treats "" as "nothing selected". That sentinel must become a
 * real NULL here, or Postgres rejects it as a missing foreign key.
 */
const NO_SUPPLIER = "none";
const supplierIdOrNull = (v: string | undefined) =>
  !v || v === NO_SUPPLIER ? null : v;

export async function createProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;

  try {
    const actor = await assertPermission("catalogue.manage");

    const parsed = readProduct(formData);
    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const sku = parsed.data.sku.toUpperCase();

    const clash = await prisma.product.findUnique({
      where: { sku },
      select: { id: true },
    });
    if (clash) {
      return actionError("That stock code is already in use.", {
        sku: "Already in use.",
      });
    }

    const created = await prisma.product.create({
      data: {
        sku,
        itemType: parsed.data.itemType,
        genericName: parsed.data.genericName,
        brandName: nullIfBlank(parsed.data.brandName),
        strength: nullIfBlank(parsed.data.strength),
        dosageForm: parsed.data.dosageForm,
        description: nullIfBlank(parsed.data.description),
        categoryId: parsed.data.categoryId,
        supplierId: supplierIdOrNull(parsed.data.supplierId),
        baseUnit: parsed.data.baseUnit,
        packUnit: nullIfBlank(parsed.data.packUnit),
        unitsPerPack: parsed.data.unitsPerPack,
        sellingPrice: parsed.data.sellingPrice.toFixed(4),
        reorderPoint: parsed.data.reorderPoint,
        isRxOnly: parsed.data.isRxOnly,
        requiresRefrigeration: parsed.data.requiresRefrigeration,
      },
      select: { id: true, genericName: true, brandName: true },
    });

    await recordAudit({
      userId: actor.id,
      action: "product.create",
      entity: "Product",
      entityId: created.id,
      summary: `Added product ${created.brandName ?? created.genericName} (${sku})`,
    });

    createdId = created.id;
  } catch (error) {
    return toActionError(error);
  }

  // redirect() throws to signal, so it must sit outside the try/catch.
  revalidatePath("/products");
  redirect(`/products/${createdId}`);
}

export async function updateProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("catalogue.manage");

    const id = String(formData.get("id") ?? "");
    if (!id) return actionError("Invalid request.");

    const parsed = readProduct(formData);
    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const before = await prisma.product.findUnique({
      where: { id },
      select: {
        sku: true,
        itemType: true,
        genericName: true,
        brandName: true,
        strength: true,
        dosageForm: true,
        description: true,
        categoryId: true,
        supplierId: true,
        baseUnit: true,
        packUnit: true,
        unitsPerPack: true,
        sellingPrice: true,
        reorderPoint: true,
        isRxOnly: true,
        requiresRefrigeration: true,
        _count: { select: { batches: true } },
      },
    });
    if (!before) return actionError("That item no longer exists.");

    const sku = parsed.data.sku.toUpperCase();

    // Changing the base unit once stock exists would silently reinterpret every
    // quantity already recorded - 500 tablets becoming 500 boxes.
    if (parsed.data.baseUnit !== before.baseUnit && before._count.batches > 0) {
      return actionError(
        `Cannot change the base unit: ${before._count.batches} batch(es) already record quantities in "${before.baseUnit}". Create a new product instead.`,
        { baseUnit: "Locked once stock exists." },
      );
    }

    const next = {
      sku,
      itemType: parsed.data.itemType,
      genericName: parsed.data.genericName,
      brandName: nullIfBlank(parsed.data.brandName),
      strength: nullIfBlank(parsed.data.strength),
      dosageForm: parsed.data.dosageForm,
      description: nullIfBlank(parsed.data.description),
      categoryId: parsed.data.categoryId,
      supplierId: supplierIdOrNull(parsed.data.supplierId),
      baseUnit: parsed.data.baseUnit,
      packUnit: nullIfBlank(parsed.data.packUnit),
      unitsPerPack: parsed.data.unitsPerPack,
      sellingPrice: parsed.data.sellingPrice.toFixed(4),
      reorderPoint: parsed.data.reorderPoint,
      isRxOnly: parsed.data.isRxOnly,
      requiresRefrigeration: parsed.data.requiresRefrigeration,
    };

    await prisma.product.update({ where: { id }, data: next });

    const { _count, ...comparable } = before;
    void _count;
    const changes = diffFields(comparable, next);

    if (Object.keys(changes).length > 0) {
      await recordAudit({
        userId: actor.id,
        action: "product.update",
        entity: "Product",
        entityId: id,
        summary: `Updated ${next.brandName ?? next.genericName} (${Object.keys(changes).join(", ")})`,
        metadata: changes,
      });
    }

    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return actionOk(undefined, "Product saved.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function setProductActiveAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("catalogue.manage");

    const id = String(formData.get("id") ?? "");
    const activate = formData.get("isActive") === "true";
    if (!id) return actionError("Invalid request.");

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        genericName: true,
        brandName: true,
        batches: {
          where: { status: "ACTIVE", quantityOnHand: { gt: 0 } },
          select: { quantityOnHand: true },
        },
      },
    });
    if (!product) return actionError("That item no longer exists.");

    const onHand = product.batches.reduce((n, b) => n + b.quantityOnHand, 0);
    const label = product.brandName ?? product.genericName;

    // Discontinuing something still on the shelf hides stock that physically
    // exists, which is how counts drift. Make them deal with it first.
    if (!activate && onHand > 0) {
      return actionError(
        `${label} still has ${onHand} unit(s) in stock. Dispense or dispose of them before discontinuing it.`,
      );
    }

    await prisma.product.update({
      where: { id },
      data: { isActive: activate },
    });

    await recordAudit({
      userId: actor.id,
      action: activate ? "product.activate" : "product.discontinue",
      entity: "Product",
      entityId: id,
      summary: `${activate ? "Reactivated" : "Discontinued"} ${label}`,
    });

    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return actionOk(
      undefined,
      activate ? `${label} reactivated.` : `${label} discontinued.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(80),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  expiryWarningDays: z
    .union([z.coerce.number().int().min(1).max(3650), z.literal("")])
    .optional(),
});

export async function createCategoryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("catalogue.manage");

    const parsed = categorySchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      expiryWarningDays: formData.get("expiryWarningDays") || "",
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const created = await prisma.category.create({
      data: {
        name: parsed.data.name,
        description: nullIfBlank(parsed.data.description),
        expiryWarningDays:
          typeof parsed.data.expiryWarningDays === "number"
            ? parsed.data.expiryWarningDays
            : null,
      },
      select: { id: true, name: true },
    });

    await recordAudit({
      userId: actor.id,
      action: "category.create",
      entity: "Category",
      entityId: created.id,
      summary: `Added category ${created.name}`,
    });

    revalidatePath("/products");
    return actionOk(undefined, `Category "${created.name}" added.`);
  } catch (error) {
    return toActionError(error);
  }
}
