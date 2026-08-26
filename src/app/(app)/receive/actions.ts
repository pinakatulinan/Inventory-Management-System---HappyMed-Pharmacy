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
  productId: z.string().min(1, "Choose a medicine."),
  lotNumber: z
    .string()
    .trim()
    .min(1, "Enter the lot number from the carton.")
    .max(60),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the expiry date."),
  packs: z.coerce.number().int().min(0, "Cannot be negative."),
  looseUnits: z.coerce.number().int().min(0, "Cannot be negative."),
  costPerUnit: z.coerce
    .number()
    .min(0, "Cannot be negative.")
    .max(9_999_999, "That cost looks wrong."),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

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
      lotNumber: formData.get("lotNumber"),
      expiryDate: formData.get("expiryDate"),
      packs: formData.get("packs") || 0,
      looseUnits: formData.get("looseUnits") || 0,
      costPerUnit: formData.get("costPerUnit"),
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
    if (!product) return actionError("That medicine no longer exists.");
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

    const result = await receiveStock({
      productId: product.id,
      lotNumber: parsed.data.lotNumber,
      expiryDate,
      costPerUnit: parsed.data.costPerUnit.toFixed(4),
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
        lotNumber: parsed.data.lotNumber,
      },
      result.created
        ? `Opened lot ${parsed.data.lotNumber} of ${label} with ${quantity} ${product.baseUnit}.`
        : `Added ${quantity} ${product.baseUnit} to existing lot ${parsed.data.lotNumber} of ${label}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
