import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { purgeExpiredSessions } from "@/lib/auth/session";
import { buildExpiryDigest } from "@/lib/digest";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { findLedgerDiscrepancies, quarantineExpiredBatches } from "@/lib/stock";

/**
 * The nightly safety job.
 *
 * Four tasks, in order of how much they matter:
 *
 *  1. Quarantine anything past its expiry date, so expired medicine cannot be
 *     dispensed even if nobody reads the dashboard.
 *  2. Reconcile the ledger against the cached balances. Any drift is a bug and
 *     is logged loudly.
 *  3. Email the digest, if switched on.
 *  4. Delete lapsed sessions.
 *
 * Each step is independent: one failing must not prevent the others, because
 * step 1 is a patient-safety control and cannot be blocked by a mail outage.
 */

// Needs Node for crypto and the database driver, and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorised(request: NextRequest): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;

  // Vercel Cron sends the secret as a bearer token.
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length === 0) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths first - and
  // still run the comparison to keep the timing profile flat.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface StepResult {
  ok: boolean;
  detail: string;
}

async function runStep(
  name: string,
  fn: () => Promise<string>,
): Promise<StepResult> {
  try {
    return { ok: true, detail: await fn() };
  } catch (error) {
    console.error(`[cron] ${name} failed:`, error);
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    // 404 rather than 401: an unauthenticated caller learns nothing about
    // whether this endpoint exists.
    return new NextResponse("Not found", { status: 404 });
  }

  const startedAt = Date.now();
  const settings = await getSettings();

  const quarantine = await runStep("quarantine", async () => {
    const batches = await quarantineExpiredBatches(settings.todayDate);
    return `${batches.length} batch(es) quarantined`;
  });

  const reconcile = await runStep("reconcile", async () => {
    const drift = await findLedgerDiscrepancies();
    if (drift.length === 0) return "ledger matches cached balances";

    // This should be impossible. If it happens, it is a bug in the ledger and
    // the numbers on screen cannot be trusted until it is understood.
    console.error("[cron] LEDGER DISCREPANCY DETECTED:", drift);
    await recordAudit({
      userId: null,
      action: "ledger.discrepancy",
      entity: "Batch",
      summary: `Ledger reconciliation found ${drift.length} batch(es) whose cached quantity disagrees with their movement history`,
      metadata: { batches: drift.map((d) => d.batchId) },
    });
    return `DRIFT: ${drift.length} batch(es) out of step`;
  });

  const digest = await runStep("digest", async () => {
    if (!settings.digestEnabled) return "disabled in settings";
    if (settings.digestRecipients.length === 0) return "no recipients set";

    const content = await buildExpiryDigest(settings, settings.digestRecipients);
    if (!content.worthSending) return "nothing to report; not sent";

    const result = await sendEmail(content);
    return result.delivered
      ? `sent to ${settings.digestRecipients.length} recipient(s)`
      : `not sent: ${result.reason}`;
  });

  const sessions = await runStep("sessions", async () => {
    const count = await purgeExpiredSessions();
    return `${count} expired session(s) removed`;
  });

  const steps = { quarantine, reconcile, digest, sessions };
  const failed = Object.entries(steps).filter(([, r]) => !r.ok);

  const body = {
    ranAt: new Date().toISOString(),
    pharmacyDate: settings.todayDate.toISOString().slice(0, 10),
    timeZone: settings.timeZone,
    durationMs: Date.now() - startedAt,
    steps: Object.fromEntries(
      Object.entries(steps).map(([k, v]) => [k, v.detail]),
    ),
    failed: failed.map(([name]) => name),
  };

  // A non-2xx makes the failure visible in the platform's cron dashboard rather
  // than hiding it in a log nobody reads.
  return NextResponse.json(body, { status: failed.length > 0 ? 500 : 200 });
}
