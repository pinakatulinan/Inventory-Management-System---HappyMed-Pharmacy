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
import { recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import {
  adjustBatch,
  disposeBatchStock,
  returnBatchToSupplier,
} from "@/lib/stock";

function revalidateStockViews(productId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/expiry");
  if (productId) revalidatePath(`/products/${productId}`);
}

const adjustSchema = z.object({
  batchId: z.string().min(1),
  direction: z.enum(["increase", "decrease"]),
  quantity: z.coerce
    .number()
    .int("Whole units only.")
    .min(1, "Enter how many units."),
  reason: z.string().trim().min(3, "Explain why the count is changing."),
});

export async function adjustBatchAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("stock.adjust");

    const parsed = adjustSchema.safeParse({
      batchId: formData.get("batchId"),
      direction: formData.get("direction"),
      quantity: formData.get("quantity"),
      reason: formData.get("reason"),
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const batch = await prisma.batch.findUnique({
      where: { id: parsed.data.batchId },
      select: { productId: true, lotNumber: true },
    });
    if (!batch) return actionError("That batch no longer exists.");

    // The sign is derived here rather than trusted from the client, so a
    // tampered form cannot turn a write-off into a stock increase.
    const delta =
      parsed.data.direction === "increase"
        ? parsed.data.quantity
        : -parsed.data.quantity;

    const balanceAfter = await adjustBatch({
      batchId: parsed.data.batchId,
      delta,
      reason: parsed.data.reason,
      userId: actor.id,
    });

    revalidateStockViews(batch.productId);
    return actionOk(
      undefined,
      `Lot ${batch.lotNumber} adjusted by ${delta > 0 ? "+" : ""}${delta}. Now ${balanceAfter}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

const disposeSchema = z.object({
  batchId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Enter how many units."),
  reason: z.string().trim().min(3, "Record why this stock is being written off."),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function disposeBatchAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("stock.dispose");

    const parsed = disposeSchema.safeParse({
      batchId: formData.get("batchId"),
      quantity: formData.get("quantity"),
      reason: formData.get("reason"),
      reference: formData.get("reference") ?? "",
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const batch = await prisma.batch.findUnique({
      where: { id: parsed.data.batchId },
      select: { productId: true, lotNumber: true },
    });
    if (!batch) return actionError("That batch no longer exists.");

    const balanceAfter = await disposeBatchStock({
      batchId: parsed.data.batchId,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      userId: actor.id,
      referenceId: parsed.data.reference || null,
    });

    revalidateStockViews(batch.productId);
    return actionOk(
      undefined,
      balanceAfter === 0
        ? `Lot ${batch.lotNumber} fully disposed of and closed.`
        : `Disposed of ${parsed.data.quantity} units. ${balanceAfter} remain in lot ${batch.lotNumber}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

const returnSchema = z.object({
  batchId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Enter how many units."),
  reason: z.string().trim().min(3, "Record why this is going back."),
});

export async function returnBatchAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("stock.dispose");

    const parsed = returnSchema.safeParse({
      batchId: formData.get("batchId"),
      quantity: formData.get("quantity"),
      reason: formData.get("reason"),
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const batch = await prisma.batch.findUnique({
      where: { id: parsed.data.batchId },
      select: { productId: true, lotNumber: true },
    });
    if (!batch) return actionError("That batch no longer exists.");

    const balanceAfter = await returnBatchToSupplier({
      batchId: parsed.data.batchId,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      userId: actor.id,
    });

    revalidateStockViews(batch.productId);
    return actionOk(
      undefined,
      `Returned ${parsed.data.quantity} units from lot ${batch.lotNumber}. ${balanceAfter} remain.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Manually block or release a batch.
 *
 * No quantity changes, so this writes no ledger row - only an audit entry.
 * Used for recalls and damaged stock, alongside the nightly automatic
 * quarantine of anything past its expiry date.
 */
export async function setBatchQuarantineAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("stock.adjust");

    const batchId = String(formData.get("batchId") ?? "");
    const quarantine = formData.get("quarantine") === "true";
    const reason = String(formData.get("reason") ?? "").trim();

    if (!batchId) return actionError("Invalid request.");
    if (reason.length < 3) {
      return actionError("Give a reason.", { reason: "Explain the change." });
    }

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        lotNumber: true,
        status: true,
        productId: true,
        expiryDate: true,
      },
    });
    if (!batch) return actionError("That batch no longer exists.");

    if (quarantine && batch.status !== "ACTIVE") {
      return actionError("Only an active batch can be quarantined.");
    }
    if (!quarantine && batch.status !== "QUARANTINED") {
      return actionError("That batch is not quarantined.");
    }

    // Releasing expired stock back for dispensing must never be possible.
    if (!quarantine) {
      const { todayDate } = await getSettings();
      if (batch.expiryDate.getTime() < todayDate.getTime()) {
        return actionError(
          "This batch has passed its expiry date and cannot be released. Dispose of it instead.",
        );
      }
    }

    await prisma.batch.update({
      where: { id: batchId },
      data: { status: quarantine ? "QUARANTINED" : "ACTIVE" },
    });

    await recordAudit({
      userId: actor.id,
      action: quarantine ? "batch.quarantine" : "batch.release",
      entity: "Batch",
      entityId: batchId,
      summary: `${quarantine ? "Quarantined" : "Released"} lot ${batch.lotNumber}: ${reason}`,
      metadata: { reason },
    });

    revalidateStockViews(batch.productId);
    return actionOk(
      undefined,
      quarantine
        ? `Lot ${batch.lotNumber} quarantined and blocked from dispensing.`
        : `Lot ${batch.lotNumber} released for dispensing.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

const expirySchema = z.object({
  batchId: z.string().min(1),
  expiryDate: z.coerce.date({ error: "Enter the expiry date from the box." }),
});

/**
 * Correct the expiry date recorded against one batch.
 *
 * Expiry belongs to the batch rather than the product, because the same item
 * sits on the shelf as several boxes with different dates. The product edit
 * screen therefore offers one field per batch instead of a single field for the
 * product as a whole.
 *
 * Setting a real date on a quarantined batch releases it: quarantine on imported
 * stock exists precisely because nobody had read the box yet, and typing the date
 * off it is that check. An already-expired box is the exception and stays blocked.
 */
export async function updateBatchExpiryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("stock.adjust");

    const parsed = expirySchema.safeParse({
      batchId: formData.get("batchId"),
      expiryDate: formData.get("expiryDate"),
    });
    if (!parsed.success) {
      return actionError("Check the date.", fieldErrorsFrom(parsed.error));
    }
    const { batchId, expiryDate } = parsed.data;

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        lotNumber: true,
        status: true,
        productId: true,
        expiryDate: true,
      },
    });
    if (!batch) return actionError("That batch no longer exists.");

    if (batch.status === "DISPOSED" || batch.status === "RETURNED") {
      return actionError(
        "This batch has already left the pharmacy, so its expiry date cannot be changed.",
      );
    }

    // A date input yields a civil date; store UTC midnight so it stays the same
    // calendar day everywhere, matching how receiveStock writes expiry.
    const civil = new Date(
      Date.UTC(
        expiryDate.getUTCFullYear(),
        expiryDate.getUTCMonth(),
        expiryDate.getUTCDate(),
      ),
    );

    if (civil.getTime() === batch.expiryDate.getTime()) {
      return actionOk(undefined, "That is already the recorded expiry date.");
    }

    const { todayDate } = await getSettings();
    const expired = civil.getTime() < todayDate.getTime();
    const wasQuarantined = batch.status === "QUARANTINED";
    const release = wasQuarantined && !expired;

    await prisma.batch.update({
      where: { id: batchId },
      data: {
        expiryDate: civil,
        ...(release ? { status: "ACTIVE", notes: null } : {}),
      },
    });

    await recordAudit({
      userId: actor.id,
      action: "batch.expiry",
      entity: "Batch",
      entityId: batchId,
      summary:
        `Expiry for lot ${batch.lotNumber} changed from ` +
        `${batch.expiryDate.toISOString().slice(0, 10)} to ${civil.toISOString().slice(0, 10)}` +
        (release ? " and released from quarantine" : ""),
      metadata: {
        expiryDate: {
          from: batch.expiryDate.toISOString().slice(0, 10),
          to: civil.toISOString().slice(0, 10),
        },
      },
    });

    revalidateStockViews(batch.productId);

    if (expired && wasQuarantined) {
      return actionOk(
        undefined,
        `Lot ${batch.lotNumber} has already expired. It stays quarantined - dispose of it.`,
      );
    }
    return actionOk(
      undefined,
      release
        ? `Lot ${batch.lotNumber} updated and released for dispensing.`
        : `Expiry date for lot ${batch.lotNumber} updated.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
