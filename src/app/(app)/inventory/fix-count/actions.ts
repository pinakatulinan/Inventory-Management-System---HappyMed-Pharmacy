"use server";

import { revalidatePath } from "next/cache";

import {
  actionError,
  actionOk,
  toActionError,
  type ActionResult,
} from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { adjustBatch } from "@/lib/stock";

export interface CountableBatch {
  id: string;
  lotNumber: string;
  expiryDate: string;
  quantityOnHand: number;
  onHold: boolean;
}

const COUNTABLE = ["ACTIVE", "QUARANTINED"] as const;

/** The lots of one item that could be on the shelf, soonest-expiring first. */
export async function getCountableBatchesAction(
  productId: string,
): Promise<ActionResult<CountableBatch[]>> {
  try {
    await assertPermission("stock.count");

    const batches = await prisma.batch.findMany({
      where: { productId, status: { in: [...COUNTABLE] } },
      orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        quantityOnHand: true,
        status: true,
      },
    });

    return actionOk(
      batches.map((b) => ({
        id: b.id,
        lotNumber: b.lotNumber,
        expiryDate: b.expiryDate.toISOString().slice(0, 10),
        quantityOnHand: b.quantityOnHand,
        onHold: b.status === "QUARANTINED",
      })),
    );
  } catch (error) {
    return toActionError(error);
  }
}

export interface FixCountResult {
  productId: string;
  changes: { lotNumber: string; from: number; to: number }[];
}

/**
 * Set each lot to the count someone actually made on the shelf.
 *
 * The form sends the real count, not a difference, so the person never does
 * arithmetic. The difference is worked out here from the current balance and
 * recorded as an ordinary adjustment, which keeps the ledger and the audit trail
 * exactly as they are for every other stock change.
 */
export async function fixCountAction(
  _prev: ActionResult<FixCountResult>,
  formData: FormData,
): Promise<ActionResult<FixCountResult>> {
  try {
    const actor = await assertPermission("stock.count");

    const productId = String(formData.get("productId") ?? "");
    if (!productId) return actionError("Choose an item first.");

    const note = String(formData.get("note") ?? "").trim().slice(0, 300);
    const reason = note
      ? `Shelf count correction: ${note}`
      : "Shelf count correction";

    const counts: { batchId: string; count: number }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("count_") || typeof value !== "string") continue;
      if (value.trim() === "") continue;
      const count = Number(value);
      if (!Number.isInteger(count) || count < 0) {
        return actionError("Counts must be whole numbers, zero or more.");
      }
      counts.push({ batchId: key.slice("count_".length), count });
    }
    if (counts.length === 0) return actionError("Enter at least one count.");

    const changes: FixCountResult["changes"] = [];

    for (const { batchId, count } of counts) {
      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        select: {
          productId: true,
          lotNumber: true,
          quantityOnHand: true,
          status: true,
        },
      });
      // Never trust the id from the form to belong to the chosen item.
      if (!batch || batch.productId !== productId) {
        return actionError("A lot on this form no longer exists. Reload and try again.");
      }
      if (!(COUNTABLE as readonly string[]).includes(batch.status)) {
        return actionError(`Lot ${batch.lotNumber} can no longer be counted.`);
      }

      const delta = count - batch.quantityOnHand;
      if (delta === 0) continue;

      await adjustBatch({ batchId, delta, reason, userId: actor.id });
      changes.push({
        lotNumber: batch.lotNumber,
        from: batch.quantityOnHand,
        to: count,
      });
    }

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath("/expiry");
    revalidatePath(`/products/${productId}`);

    if (changes.length === 0) {
      return actionOk({ productId, changes }, "Nothing to change. The counts already match.");
    }
    return actionOk(
      { productId, changes },
      `Updated ${changes.length} lot${changes.length === 1 ? "" : "s"}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
