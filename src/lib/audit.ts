import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export interface AuditEntry {
  userId: string | null;
  /** Dotted verb, e.g. "product.update", "batch.dispose", "user.deactivate". */
  action: string;
  entity: string;
  entityId?: string | null;
  /** Shown verbatim in the audit table, so write it for a human reader. */
  summary: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

/**
 * Append an audit record.
 *
 * Pass the transaction client whenever the audited change is itself
 * transactional - the log entry must commit or roll back with the change it
 * describes, otherwise the trail records things that never happened.
 */
export async function recordAudit(
  entry: AuditEntry,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      metadata: entry.metadata,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

/**
 * Shallow diff for audit metadata: records only the fields that actually
 * changed, as { field: { from, to } }. Keeps the log readable and small.
 *
 * Values are stringified rather than stored raw. Prisma Decimal and Date are
 * not JSON values, so storing them directly would either fail to serialise or
 * land in the column in a shape that reads back wrong. A string is what the
 * audit table displays anyway.
 */
export type FieldDiff = Record<string, { from: string | null; to: string | null }>;

export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff {
  const changes: FieldDiff = {};

  const asText = (value: unknown): string | null =>
    value === null || value === undefined ? null : String(value);

  for (const [key, next] of Object.entries(after)) {
    const from = asText(before[key]);
    const to = asText(next);
    if (from !== to) changes[key] = { from, to };
  }

  return changes;
}
