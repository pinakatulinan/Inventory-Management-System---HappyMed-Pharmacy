import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { BatchStatus, MovementType } from "@/generated/prisma/enums";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

/**
 * The stock ledger.
 *
 * Every quantity change in the system goes through `applyDelta`. Nothing else
 * may write Batch.quantityOnHand. That single choke point is what guarantees
 * the ledger and the cached balance can never disagree.
 *
 * Concurrency: the pharmacy has several people at several terminals. Reading a
 * quantity into JavaScript, subtracting, and writing it back would silently
 * lose one of two simultaneous dispenses. So the balance is changed by a single
 * conditional UPDATE that both mutates and validates in one statement, and
 * multi-batch operations take row locks in a deterministic order first.
 */

export class InsufficientStockError extends Error {
  constructor(
    readonly requested: number,
    readonly available: number,
    readonly label: string,
  ) {
    super(
      `Not enough stock for ${label}: requested ${requested}, available ${available}.`,
    );
    this.name = "InsufficientStockError";
  }
}

export class BatchNotDispensableError extends Error {
  constructor(readonly batchId: string, readonly status: BatchStatus) {
    super(`Batch is ${status} and cannot be used for this operation.`);
    this.name = "BatchNotDispensableError";
  }
}

type Tx = Prisma.TransactionClient;

interface ApplyDeltaParams {
  batchId: string;
  productId: string;
  /** Signed. Positive adds stock, negative removes it. */
  delta: number;
  type: MovementType;
  /** Batch statuses this operation is legal from. */
  allowedStatuses: BatchStatus[];
  userId: string;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}

/**
 * The one and only writer of Batch.quantityOnHand.
 * Returns the new balance.
 */
async function applyDelta(tx: Tx, params: ApplyDeltaParams): Promise<number> {
  const {
    batchId,
    productId,
    delta,
    type,
    allowedStatuses,
    userId,
    reason,
    referenceType,
    referenceId,
  } = params;

  if (!Number.isInteger(delta)) {
    throw new Error("Stock movements must be whole base units.");
  }
  if (delta === 0) {
    throw new Error("A stock movement cannot be zero.");
  }

  const statusList = Prisma.join(
    allowedStatuses.map((status) => Prisma.sql`${status}`),
  );

  // Mutate and validate in one statement: the row is never read, decided upon,
  // and written back, so two concurrent dispenses cannot both succeed against
  // the same last unit.
  const rows = await tx.$queryRaw<{ quantityOnHand: number }[]>`
    UPDATE "Batch"
       SET "quantityOnHand" = "quantityOnHand" + ${delta}::int,
           "updatedAt" = NOW()
     WHERE "id" = ${batchId}
       AND "quantityOnHand" + ${delta}::int >= 0
       AND "status"::text IN (${statusList})
    RETURNING "quantityOnHand"
  `;

  if (rows.length === 0) {
    // The update matched nothing. Find out why, so the user gets a real message.
    const batch = await tx.batch.findUnique({
      where: { id: batchId },
      select: {
        quantityOnHand: true,
        status: true,
        lotNumber: true,
        product: { select: { genericName: true, brandName: true } },
      },
    });

    if (!batch) throw new Error(`Batch ${batchId} no longer exists.`);

    if (!allowedStatuses.includes(batch.status)) {
      throw new BatchNotDispensableError(batchId, batch.status);
    }

    const label = `${batch.product.brandName ?? batch.product.genericName} (lot ${batch.lotNumber})`;
    throw new InsufficientStockError(
      Math.abs(delta),
      batch.quantityOnHand,
      label,
    );
  }

  const balanceAfter = rows[0].quantityOnHand;

  await tx.stockMovement.create({
    data: {
      batchId,
      productId,
      type,
      quantity: delta,
      balanceAfter,
      reason: reason ?? null,
      referenceType: referenceType ?? null,
      referenceId: referenceId ?? null,
      userId,
    },
  });

  // Keep the lifecycle flag in step with the balance. DEPLETED is bookkeeping,
  // not a block: receiving more stock brings the batch back to ACTIVE.
  if (balanceAfter === 0) {
    await tx.batch.updateMany({
      where: { id: batchId, status: "ACTIVE" },
      data: { status: "DEPLETED" },
    });
  } else {
    await tx.batch.updateMany({
      where: { id: batchId, status: "DEPLETED" },
      data: { status: "ACTIVE" },
    });
  }

  return balanceAfter;
}

// ---------------------------------------------------------------------------
// Receiving
// ---------------------------------------------------------------------------

export interface ReceiveStockParams {
  productId: string;
  lotNumber: string;
  expiryDate: Date;
  /** Cost per BASE UNIT. */
  costPerUnit: Prisma.Decimal | string | number;
  /** Quantity in BASE UNITS. */
  quantity: number;
  userId: string;
  purchaseOrderId?: string | null;
  notes?: string | null;
}

/**
 * Take delivery of stock. Tops up the batch if this lot is already on the
 * shelf, otherwise opens a new one.
 */
export async function receiveStock(
  params: ReceiveStockParams,
): Promise<{ batchId: string; balanceAfter: number; created: boolean }> {
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    throw new Error("Received quantity must be a positive whole number.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.batch.findUnique({
      where: {
        productId_lotNumber: {
          productId: params.productId,
          lotNumber: params.lotNumber,
        },
      },
      select: { id: true, expiryDate: true, status: true },
    });

    if (existing) {
      // Same lot number with a different expiry date means someone mistyped
      // one of them. Refuse rather than silently merge two physical lots.
      if (existing.expiryDate.getTime() !== params.expiryDate.getTime()) {
        throw new Error(
          `Lot ${params.lotNumber} already exists with a different expiry date. ` +
            `Check the packaging: recorded ${existing.expiryDate.toISOString().slice(0, 10)}, ` +
            `entered ${params.expiryDate.toISOString().slice(0, 10)}.`,
        );
      }

      const balanceAfter = await applyDelta(tx, {
        batchId: existing.id,
        productId: params.productId,
        delta: params.quantity,
        type: "RECEIPT",
        allowedStatuses: ["ACTIVE", "DEPLETED"],
        userId: params.userId,
        reason: params.notes ?? null,
        referenceType: params.purchaseOrderId ? "PurchaseOrder" : null,
        referenceId: params.purchaseOrderId ?? null,
      });

      await tx.batch.update({
        where: { id: existing.id },
        data: { quantityReceived: { increment: params.quantity } },
      });

      await recordAudit(
        {
          userId: params.userId,
          action: "stock.receive",
          entity: "Batch",
          entityId: existing.id,
          summary: `Received ${params.quantity} units into existing lot ${params.lotNumber}`,
          metadata: { quantity: params.quantity, balanceAfter },
        },
        tx,
      );

      return { batchId: existing.id, balanceAfter, created: false };
    }

    const batch = await tx.batch.create({
      data: {
        productId: params.productId,
        lotNumber: params.lotNumber,
        expiryDate: params.expiryDate,
        costPerUnit: params.costPerUnit,
        quantityReceived: params.quantity,
        quantityOnHand: params.quantity,
        status: "ACTIVE",
        purchaseOrderId: params.purchaseOrderId ?? null,
        notes: params.notes ?? null,
      },
      select: { id: true },
    });

    // The opening balance is a ledger entry like any other, so a batch's
    // history can always be replayed from zero.
    await tx.stockMovement.create({
      data: {
        batchId: batch.id,
        productId: params.productId,
        type: "RECEIPT",
        quantity: params.quantity,
        balanceAfter: params.quantity,
        reason: params.notes ?? null,
        referenceType: params.purchaseOrderId ? "PurchaseOrder" : null,
        referenceId: params.purchaseOrderId ?? null,
        userId: params.userId,
      },
    });

    await recordAudit(
      {
        userId: params.userId,
        action: "stock.receive",
        entity: "Batch",
        entityId: batch.id,
        summary: `Opened lot ${params.lotNumber} with ${params.quantity} units`,
        metadata: {
          quantity: params.quantity,
          expiryDate: params.expiryDate.toISOString().slice(0, 10),
        },
      },
      tx,
    );

    return { batchId: batch.id, balanceAfter: params.quantity, created: true };
  });
}

// ---------------------------------------------------------------------------
// Dispensing (FEFO)
// ---------------------------------------------------------------------------

export interface Allocation {
  batchId: string;
  lotNumber: string;
  expiryDate: Date;
  quantity: number;
  balanceAfter: number;
}

/**
 * Dispense using First-Expired-First-Out.
 *
 * Expired batches are excluded twice over: they are normally QUARANTINED by the
 * nightly job, and the query also filters on the date directly. A missed cron
 * run must never put expired medicine over the counter.
 */
export async function dispenseProductFEFO(params: {
  productId: string;
  quantity: number;
  userId: string;
  /** Today's date in the pharmacy timezone, at UTC midnight. */
  today: Date;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}): Promise<Allocation[]> {
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    throw new Error("Dispensed quantity must be a positive whole number.");
  }

  return prisma.$transaction(async (tx) => {
    // FOR UPDATE holds these rows for the life of the transaction, so the plan
    // we build below cannot be invalidated by a concurrent dispense. The ORDER
    // BY is deterministic, which keeps concurrent callers from deadlocking.
    const candidates = await tx.$queryRaw<
      {
        id: string;
        lotNumber: string;
        expiryDate: Date;
        quantityOnHand: number;
      }[]
    >`
      SELECT "id", "lotNumber", "expiryDate", "quantityOnHand"
        FROM "Batch"
       WHERE "productId" = ${params.productId}
         AND "status"::text = 'ACTIVE'
         AND "quantityOnHand" > 0
         AND "expiryDate" >= ${params.today}::date
       ORDER BY "expiryDate" ASC, "id" ASC
         FOR UPDATE
    `;

    const available = candidates.reduce((sum, b) => sum + b.quantityOnHand, 0);

    if (available < params.quantity) {
      const product = await tx.product.findUnique({
        where: { id: params.productId },
        select: { genericName: true, brandName: true },
      });
      throw new InsufficientStockError(
        params.quantity,
        available,
        product?.brandName ?? product?.genericName ?? "this product",
      );
    }

    const allocations: Allocation[] = [];
    let remaining = params.quantity;

    for (const batch of candidates) {
      if (remaining === 0) break;

      const take = Math.min(remaining, batch.quantityOnHand);

      const balanceAfter = await applyDelta(tx, {
        batchId: batch.id,
        productId: params.productId,
        delta: -take,
        type: "DISPENSE",
        allowedStatuses: ["ACTIVE"],
        userId: params.userId,
        reason: params.reason ?? null,
        referenceType: params.referenceType ?? null,
        referenceId: params.referenceId ?? null,
      });

      allocations.push({
        batchId: batch.id,
        lotNumber: batch.lotNumber,
        expiryDate: batch.expiryDate,
        quantity: take,
        balanceAfter,
      });

      remaining -= take;
    }

    return allocations;
  });
}

/**
 * Dispense from one nominated batch, overriding FEFO.
 * The reason is mandatory - an override is exactly the thing an auditor asks about.
 */
export async function dispenseFromBatch(params: {
  batchId: string;
  quantity: number;
  userId: string;
  reason: string;
}): Promise<number> {
  if (!params.reason?.trim()) {
    throw new Error("Overriding the FEFO order requires a reason.");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: params.batchId },
      select: { productId: true, lotNumber: true },
    });
    if (!batch) throw new Error("Batch not found.");

    const balanceAfter = await applyDelta(tx, {
      batchId: params.batchId,
      productId: batch.productId,
      delta: -params.quantity,
      type: "DISPENSE",
      allowedStatuses: ["ACTIVE"],
      userId: params.userId,
      reason: params.reason,
    });

    await recordAudit(
      {
        userId: params.userId,
        action: "stock.dispense.override",
        entity: "Batch",
        entityId: params.batchId,
        summary: `FEFO override: dispensed ${params.quantity} from lot ${batch.lotNumber}`,
        metadata: { reason: params.reason, balanceAfter },
      },
      tx,
    );

    return balanceAfter;
  });
}

// ---------------------------------------------------------------------------
// Corrections and write-offs
// ---------------------------------------------------------------------------

/** Physical count correction. Signed, and always requires a reason. */
export async function adjustBatch(params: {
  batchId: string;
  delta: number;
  reason: string;
  userId: string;
}): Promise<number> {
  if (!params.reason?.trim()) {
    throw new Error("Stock adjustments require a reason.");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: params.batchId },
      select: { productId: true, lotNumber: true },
    });
    if (!batch) throw new Error("Batch not found.");

    const balanceAfter = await applyDelta(tx, {
      batchId: params.batchId,
      productId: batch.productId,
      delta: params.delta,
      type: "ADJUSTMENT",
      allowedStatuses: ["ACTIVE", "QUARANTINED", "DEPLETED"],
      userId: params.userId,
      reason: params.reason,
    });

    await recordAudit(
      {
        userId: params.userId,
        action: "stock.adjust",
        entity: "Batch",
        entityId: params.batchId,
        summary: `Adjusted lot ${batch.lotNumber} by ${params.delta > 0 ? "+" : ""}${params.delta}`,
        metadata: { reason: params.reason, balanceAfter },
      },
      tx,
    );

    return balanceAfter;
  });
}

/** Write off expired or damaged stock. */
export async function disposeBatchStock(params: {
  batchId: string;
  quantity: number;
  reason: string;
  userId: string;
  /** Disposal certificate or waste-collection reference, if there is one. */
  referenceId?: string | null;
}): Promise<number> {
  if (!params.reason?.trim()) {
    throw new Error("Disposals require a reason.");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: params.batchId },
      select: { productId: true, lotNumber: true },
    });
    if (!batch) throw new Error("Batch not found.");

    const balanceAfter = await applyDelta(tx, {
      batchId: params.batchId,
      productId: batch.productId,
      delta: -params.quantity,
      type: "DISPOSAL",
      allowedStatuses: ["ACTIVE", "QUARANTINED"],
      userId: params.userId,
      reason: params.reason,
      referenceType: params.referenceId ? "DisposalCertificate" : null,
      referenceId: params.referenceId ?? null,
    });

    // Fully written off: mark DISPOSED rather than DEPLETED, so the reason the
    // batch left the shelf stays visible in reports.
    if (balanceAfter === 0) {
      await tx.batch.update({
        where: { id: params.batchId },
        data: { status: "DISPOSED" },
      });
    }

    await recordAudit(
      {
        userId: params.userId,
        action: "stock.dispose",
        entity: "Batch",
        entityId: params.batchId,
        summary: `Disposed ${params.quantity} units from lot ${batch.lotNumber}`,
        metadata: { reason: params.reason, balanceAfter },
      },
      tx,
    );

    return balanceAfter;
  });
}

/** Send stock back to the supplier (recall, over-delivery, near-dated return). */
export async function returnBatchToSupplier(params: {
  batchId: string;
  quantity: number;
  reason: string;
  userId: string;
}): Promise<number> {
  if (!params.reason?.trim()) {
    throw new Error("Supplier returns require a reason.");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: params.batchId },
      select: { productId: true, lotNumber: true },
    });
    if (!batch) throw new Error("Batch not found.");

    const balanceAfter = await applyDelta(tx, {
      batchId: params.batchId,
      productId: batch.productId,
      delta: -params.quantity,
      type: "RETURN_TO_SUPPLIER",
      allowedStatuses: ["ACTIVE", "QUARANTINED"],
      userId: params.userId,
      reason: params.reason,
    });

    if (balanceAfter === 0) {
      await tx.batch.update({
        where: { id: params.batchId },
        data: { status: "RETURNED" },
      });
    }

    await recordAudit(
      {
        userId: params.userId,
        action: "stock.return",
        entity: "Batch",
        entityId: params.batchId,
        summary: `Returned ${params.quantity} units of lot ${batch.lotNumber} to supplier`,
        metadata: { reason: params.reason, balanceAfter },
      },
      tx,
    );

    return balanceAfter;
  });
}

// ---------------------------------------------------------------------------
// Nightly safety jobs
// ---------------------------------------------------------------------------

/**
 * Block every batch that has passed its expiry date from being dispensed.
 * Quantities are untouched - the stock is still physically on the shelf until
 * someone disposes of it - so this writes no ledger rows.
 */
export async function quarantineExpiredBatches(
  today: Date,
): Promise<{ id: string; lotNumber: string; productId: string }[]> {
  const quarantined = await prisma.$queryRaw<
    { id: string; lotNumber: string; productId: string }[]
  >`
    UPDATE "Batch"
       SET "status" = 'QUARANTINED',
           "updatedAt" = NOW()
     WHERE "status"::text = 'ACTIVE'
       AND "expiryDate" < ${today}::date
    RETURNING "id", "lotNumber", "productId"
  `;

  if (quarantined.length > 0) {
    await recordAudit({
      userId: null,
      action: "batch.auto_quarantine",
      entity: "Batch",
      summary: `Automatically quarantined ${quarantined.length} expired batch(es)`,
      metadata: { batchIds: quarantined.map((b) => b.id) },
    });
  }

  return quarantined;
}

/**
 * Prove the cached balances still match the ledger.
 *
 * `quantityOnHand` is denormalised, so it is worth verifying rather than
 * trusting. Any row returned here is a bug, and the nightly job should shout
 * about it.
 */
export async function findLedgerDiscrepancies(): Promise<
  { batchId: string; lotNumber: string; cached: number; ledger: number }[]
> {
  return prisma.$queryRaw`
    SELECT b."id"             AS "batchId",
           b."lotNumber"      AS "lotNumber",
           b."quantityOnHand" AS "cached",
           COALESCE(SUM(m."quantity"), 0)::int AS "ledger"
      FROM "Batch" b
      LEFT JOIN "StockMovement" m ON m."batchId" = b."id"
     GROUP BY b."id", b."lotNumber", b."quantityOnHand"
    HAVING b."quantityOnHand" <> COALESCE(SUM(m."quantity"), 0)::int
  `;
}
