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
import { dispenseFromBatch, dispenseProductFEFO } from "@/lib/stock";
import { toBaseUnits } from "@/lib/units";

export interface AvailableBatch {
  id: string;
  lotNumber: string;
  expiryDate: string;
  quantityOnHand: number;
  daysLeft: number;
}

/**
 * Dispensable batches for one product, soonest-expiring first.
 *
 * Mirrors exactly what dispenseProductFEFO will pick, so the preview the user
 * confirms is the allocation that actually happens. Expired batches are
 * excluded here as well as in the ledger.
 */
export async function getAvailableBatchesAction(
  productId: string,
): Promise<ActionResult<AvailableBatch[]>> {
  try {
    await assertPermission("stock.dispense");
    const settings = await getSettings();

    const batches = await prisma.batch.findMany({
      where: {
        productId,
        status: "ACTIVE",
        quantityOnHand: { gt: 0 },
        expiryDate: { gte: settings.todayDate },
      },
      orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        quantityOnHand: true,
      },
    });

    return actionOk(
      batches.map((b) => ({
        id: b.id,
        lotNumber: b.lotNumber,
        expiryDate: b.expiryDate.toISOString().slice(0, 10),
        quantityOnHand: b.quantityOnHand,
        daysLeft: Math.floor(
          b.expiryDate.getTime() / 86_400_000 - settings.todayEpochDay,
        ),
      })),
    );
  } catch (error) {
    return toActionError(error);
  }
}

const dispenseSchema = z.object({
  productId: z.string().min(1, "Choose an item."),
  packs: z.coerce.number().int().min(0, "Cannot be negative."),
  looseUnits: z.coerce.number().int().min(0, "Cannot be negative."),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
  overrideBatchId: z.string().optional().or(z.literal("")),
});

export interface DispenseResult {
  productId: string;
  totalQuantity: number;
  allocations: {
    lotNumber: string;
    expiryDate: string;
    quantity: number;
    balanceAfter: number;
  }[];
}

export async function dispenseAction(
  _prev: ActionResult<DispenseResult>,
  formData: FormData,
): Promise<ActionResult<DispenseResult>> {
  try {
    const actor = await assertPermission("stock.dispense");

    const parsed = dispenseSchema.safeParse({
      productId: formData.get("productId"),
      packs: formData.get("packs") || 0,
      looseUnits: formData.get("looseUnits") || 0,
      reference: formData.get("reference") ?? "",
      reason: formData.get("reason") ?? "",
      overrideBatchId: formData.get("overrideBatchId") ?? "",
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
      return actionError("That product is discontinued and cannot be dispensed.");
    }

    const quantity = toBaseUnits(
      parsed.data.packs,
      parsed.data.looseUnits,
      product.unitsPerPack,
    );
    if (quantity <= 0) {
      return actionError("Enter how much to dispense.", {
        packs: "Enter a quantity.",
      });
    }

    const settings = await getSettings();
    const label = product.brandName ?? product.genericName;
    const referenceId = parsed.data.reference || null;

    let allocations: DispenseResult["allocations"];

    if (parsed.data.overrideBatchId) {
      // Overriding FEFO is a decision someone must justify, so the reason is
      // mandatory and lands in both the ledger and the audit log.
      if (!parsed.data.reason) {
        return actionError(
          "Choosing a specific batch requires a reason.",
          { reason: "Required when overriding the suggested batch." },
        );
      }

      const batch = await prisma.batch.findUnique({
        where: { id: parsed.data.overrideBatchId },
        select: { lotNumber: true, expiryDate: true, productId: true },
      });
      if (!batch || batch.productId !== product.id) {
        return actionError("That batch does not belong to this product.");
      }

      const balanceAfter = await dispenseFromBatch({
        batchId: parsed.data.overrideBatchId,
        quantity,
        userId: actor.id,
        reason: parsed.data.reason,
      });

      allocations = [
        {
          lotNumber: batch.lotNumber,
          expiryDate: batch.expiryDate.toISOString().slice(0, 10),
          quantity,
          balanceAfter,
        },
      ];
    } else {
      const result = await dispenseProductFEFO({
        productId: product.id,
        quantity,
        userId: actor.id,
        today: settings.todayDate,
        reason: parsed.data.reason || null,
        referenceType: referenceId ? "Dispense" : null,
        referenceId,
      });

      allocations = result.map((a) => ({
        lotNumber: a.lotNumber,
        expiryDate: a.expiryDate.toISOString().slice(0, 10),
        quantity: a.quantity,
        balanceAfter: a.balanceAfter,
      }));
    }

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath("/expiry");
    revalidatePath(`/products/${product.id}`);

    return actionOk(
      { productId: product.id, totalQuantity: quantity, allocations },
      `Dispensed ${quantity} ${product.baseUnit} of ${label} from ${allocations.length} lot(s).`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
