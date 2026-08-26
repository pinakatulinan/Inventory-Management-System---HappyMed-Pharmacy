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
import { recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { receiveStock } from "@/lib/stock";

/**
 * Sequential, human-readable order numbers: PO-202608-0007.
 *
 * Counting existing rows is racy under concurrency, so the unique constraint on
 * poNumber is the real guard and this retries on collision. A pharmacy raises a
 * handful of orders a day, so a couple of retries is ample.
 */
async function nextPoNumber(): Promise<string> {
  const now = new Date();
  const prefix = `PO-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const count = await prisma.purchaseOrder.count({
    where: { poNumber: { startsWith: prefix } },
  });

  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

const lineSchema = z.object({
  productId: z.string().min(1),
  quantityOrdered: z.coerce.number().int().min(1),
  unitCost: z.coerce.number().min(0),
});

const createSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier."),
  expectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function createPurchaseOrderAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;

  try {
    const actor = await assertPermission("po.manage");

    const parsed = createSchema.safeParse({
      supplierId: formData.get("supplierId"),
      expectedDate: formData.get("expectedDate") ?? "",
      notes: formData.get("notes") ?? "",
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    // Lines arrive as a JSON blob so the whole order posts as one form.
    const rawLines = formData.get("lines");
    let lines: z.infer<typeof lineSchema>[];
    try {
      const parsedLines = z.array(lineSchema).safeParse(JSON.parse(String(rawLines ?? "[]")));
      if (!parsedLines.success) {
        return actionError("One of the order lines is invalid.");
      }
      lines = parsedLines.data;
    } catch {
      return actionError("Could not read the order lines.");
    }

    if (lines.length === 0) {
      return actionError("Add at least one product to the order.");
    }

    // The unique constraint on [purchaseOrderId, productId] would reject this
    // anyway; catching it here gives a message that explains itself.
    const productIds = new Set(lines.map((l) => l.productId));
    if (productIds.size !== lines.length) {
      return actionError(
        "The same product appears more than once. Combine the quantities into one line.",
      );
    }

    const expectedDate = parsed.data.expectedDate
      ? new Date(`${parsed.data.expectedDate}T00:00:00.000Z`)
      : null;

    const supplier = await prisma.supplier.findUnique({
      where: { id: parsed.data.supplierId },
      select: { name: true, isActive: true },
    });
    if (!supplier) return actionError("That supplier no longer exists.");
    if (!supplier.isActive) {
      return actionError("That supplier is inactive. Reactivate it first.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const order = await prisma.purchaseOrder.create({
          data: {
            poNumber: await nextPoNumber(),
            supplierId: parsed.data.supplierId,
            status: "DRAFT",
            expectedDate,
            notes: parsed.data.notes || null,
            createdById: actor.id,
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                quantityOrdered: l.quantityOrdered,
                unitCost: l.unitCost.toFixed(4),
              })),
            },
          },
          select: { id: true, poNumber: true },
        });

        await recordAudit({
          userId: actor.id,
          action: "po.create",
          entity: "PurchaseOrder",
          entityId: order.id,
          summary: `Created ${order.poNumber} for ${supplier.name} with ${lines.length} line(s)`,
        });

        createdId = order.id;
        break;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "P2002" && attempt < 2) continue;
        throw error;
      }
    }

    if (!createdId) return actionError("Could not allocate an order number.");
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${createdId}`);
}

export async function setPurchaseOrderStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("po.manage");

    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "");
    if (!id || !["SUBMITTED", "CANCELLED", "DRAFT"].includes(status)) {
      return actionError("Invalid request.");
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { poNumber: true, status: true, _count: { select: { batches: true } } },
    });
    if (!order) return actionError("That order no longer exists.");

    if (order.status === "RECEIVED") {
      return actionError("This order is already fully received.");
    }

    // Cancelling after stock has physically arrived would orphan the batches
    // that were booked in against it.
    if (status === "CANCELLED" && order._count.batches > 0) {
      return actionError(
        "Stock has already been received against this order, so it cannot be cancelled.",
      );
    }

    await prisma.purchaseOrder.update({
      where: { id },
      data: { status: status as "SUBMITTED" | "CANCELLED" | "DRAFT" },
    });

    await recordAudit({
      userId: actor.id,
      action: `po.${status.toLowerCase()}`,
      entity: "PurchaseOrder",
      entityId: id,
      summary: `${order.poNumber} moved from ${order.status} to ${status}`,
    });

    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${id}`);
    return actionOk(undefined, `${order.poNumber} is now ${status.toLowerCase()}.`);
  } catch (error) {
    return toActionError(error);
  }
}

const receiveLineSchema = z.object({
  purchaseOrderId: z.string().min(1),
  itemId: z.string().min(1),
  lotNumber: z.string().trim().min(1, "Enter the lot number.").max(60),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the expiry date."),
  quantity: z.coerce.number().int().min(1, "Enter how many arrived."),
  unitCost: z.coerce.number().min(0),
});

/**
 * Book a delivery in against one line of a purchase order.
 *
 * Goes through receiveStock like any other delivery, so the batch, the ledger
 * entry and the audit record are created by exactly the same code path. The
 * only extra work here is advancing the order's own progress.
 */
export async function receiveAgainstOrderAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("stock.receive");

    const parsed = receiveLineSchema.safeParse({
      purchaseOrderId: formData.get("purchaseOrderId"),
      itemId: formData.get("itemId"),
      lotNumber: formData.get("lotNumber"),
      expiryDate: formData.get("expiryDate"),
      quantity: formData.get("quantity"),
      unitCost: formData.get("unitCost"),
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const item = await prisma.purchaseOrderItem.findUnique({
      where: { id: parsed.data.itemId },
      select: {
        id: true,
        productId: true,
        quantityOrdered: true,
        quantityReceived: true,
        purchaseOrderId: true,
        product: { select: { genericName: true, brandName: true, baseUnit: true } },
        purchaseOrder: { select: { poNumber: true, status: true } },
      },
    });

    if (!item || item.purchaseOrderId !== parsed.data.purchaseOrderId) {
      return actionError("That order line no longer exists.");
    }
    if (item.purchaseOrder.status === "CANCELLED") {
      return actionError("This order was cancelled.");
    }

    const settings = await getSettings();
    const [y, m, d] = parsed.data.expiryDate.split("-").map(Number);
    const expiryDate = new Date(Date.UTC(y, m - 1, d));

    if (expiryDate.getTime() < settings.todayDate.getTime()) {
      return actionError("That expiry date has already passed.", {
        expiryDate: "Already expired.",
      });
    }

    await receiveStock({
      productId: item.productId,
      lotNumber: parsed.data.lotNumber,
      expiryDate,
      costPerUnit: parsed.data.unitCost.toFixed(4),
      quantity: parsed.data.quantity,
      userId: actor.id,
      purchaseOrderId: item.purchaseOrderId,
      notes: `Received against ${item.purchaseOrder.poNumber}`,
    });

    await prisma.purchaseOrderItem.update({
      where: { id: item.id },
      data: { quantityReceived: { increment: parsed.data.quantity } },
    });

    // Recompute the order status from its lines rather than tracking it
    // separately, so the two can never disagree.
    const lines = await prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: item.purchaseOrderId },
      select: { quantityOrdered: true, quantityReceived: true },
    });

    const fullyReceived = lines.every(
      (l) => l.quantityReceived >= l.quantityOrdered,
    );
    const anyReceived = lines.some((l) => l.quantityReceived > 0);

    await prisma.purchaseOrder.update({
      where: { id: item.purchaseOrderId },
      data: {
        status: fullyReceived
          ? "RECEIVED"
          : anyReceived
            ? "PARTIALLY_RECEIVED"
            : "SUBMITTED",
        receivedDate: fullyReceived ? new Date() : null,
        receivedById: fullyReceived ? actor.id : null,
      },
    });

    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${item.purchaseOrderId}`);
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath(`/products/${item.productId}`);

    const label = item.product.brandName ?? item.product.genericName;
    return actionOk(
      undefined,
      `Received ${parsed.data.quantity} ${item.product.baseUnit} of ${label} into lot ${parsed.data.lotNumber}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
