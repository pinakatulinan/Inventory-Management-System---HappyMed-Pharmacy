"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  actionError,
  actionOk,
  fieldErrorsFrom,
  toActionError,
  type ActionResult,
} from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { receiveStock } from "@/lib/stock";
import { toBaseUnits } from "@/lib/units";

const receiveSchema = z.object({
  productId: z.string().min(1, "Choose an item."),
  // Blank means "fill it in for me" (see autoLotNumber).
  lotNumber: z.string().trim().max(60),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the expiry date."),
  packs: z.coerce.number().int().min(0, "Cannot be negative."),
  looseUnits: z.coerce.number().int().min(0, "Cannot be negative."),
  // Blank means "same as last time" (see lastCostFor).
  costPerUnit: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
      "Enter a valid cost.",
    )
    .refine((v) => v === "" || Number(v) <= 9_999_999, "That cost looks wrong."),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * Lot number for a delivery that arrived without one being typed in. It carries
 * both dates so that two deliveries of the same item with different expiry
 * dates can never collide (receiveStock refuses a lot number reused with a
 * different expiry), while a repeat entry of the same delivery tops up one lot.
 */
function autoLotNumber(received: Date, expiry: Date): string {
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
  return `AUTO-${ymd(received)}-EXP${ymd(expiry).slice(0, 6)}`;
}

/** What the pharmacy paid the last time this item came in, if ever. */
async function lastCostFor(productId: string): Promise<string | null> {
  const last = await prisma.batch.findFirst({
    // A zero cost is a placeholder (e.g. an imported opening count), not a price.
    where: { productId, costPerUnit: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    select: { costPerUnit: true },
  });
  return last ? last.costPerUnit.toString() : null;
}

export interface ReceiveResult {
  batchId: string;
  productId: string;
  quantity: number;
  balanceAfter: number;
  created: boolean;
  lotNumber: string;
}

export async function receiveStockAction(
  _prev: ActionResult<ReceiveResult>,
  formData: FormData,
): Promise<ActionResult<ReceiveResult>> {
  try {
    const actor = await assertPermission("stock.receive");

    const parsed = receiveSchema.safeParse({
      productId: formData.get("productId"),
      lotNumber: formData.get("lotNumber") ?? "",
      expiryDate: formData.get("expiryDate"),
      packs: formData.get("packs") || 0,
      looseUnits: formData.get("looseUnits") || 0,
      costPerUnit: formData.get("costPerUnit") ?? "",
      notes: formData.get("notes") ?? "",
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: {
        id: true,
        isActive: true,
        unitsPerPack: true,
        baseUnit: true,
        genericName: true,
        brandName: true,
      },
    });
    if (!product) return actionError("That item no longer exists.");
    if (!product.isActive) {
      return actionError(
        "That product is discontinued. Reactivate it before receiving stock.",
      );
    }

    const quantity = toBaseUnits(
      parsed.data.packs,
      parsed.data.looseUnits,
      product.unitsPerPack,
    );

    if (quantity <= 0) {
      return actionError("Enter how much arrived.", {
        packs: "Enter a quantity.",
      });
    }

    // Dates are calendar dates: anchor at UTC midnight so the day stays put
    // regardless of where the server is.
    const [year, month, day] = parsed.data.expiryDate.split("-").map(Number);
    const expiryDate = new Date(Date.UTC(year, month - 1, day));

    const settings = await getSettings();

    // Receiving stock that is already expired is almost always a typo in the
    // date. Refuse it rather than quietly quarantining it a moment later.
    if (expiryDate.getTime() < settings.todayDate.getTime()) {
      return actionError(
        "That expiry date has already passed. Check the date on the carton.",
        { expiryDate: "Already expired." },
      );
    }

    const lotNumber =
      parsed.data.lotNumber || autoLotNumber(settings.todayDate, expiryDate);

    const costPerUnit =
      parsed.data.costPerUnit !== ""
        ? Number(parsed.data.costPerUnit).toFixed(4)
        : await lastCostFor(product.id);
    if (costPerUnit === null) {
      return actionError(
        "This is the first delivery of this item, so enter what it cost per unit.",
        { costPerUnit: "Required for the first delivery." },
      );
    }

    const result = await receiveStock({
      productId: product.id,
      lotNumber,
      expiryDate,
      costPerUnit,
      quantity,
      userId: actor.id,
      notes: parsed.data.notes || null,
    });

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath("/expiry");
    revalidatePath(`/products/${product.id}`);

    const label = product.brandName ?? product.genericName;

    return actionOk(
      {
        batchId: result.batchId,
        productId: product.id,
        quantity,
        balanceAfter: result.balanceAfter,
        created: result.created,
        lotNumber,
      },
      result.created
        ? `Opened lot ${lotNumber} of ${label} with ${quantity} ${product.baseUnit}.`
        : `Added ${quantity} ${product.baseUnit} to existing lot ${lotNumber} of ${label}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
