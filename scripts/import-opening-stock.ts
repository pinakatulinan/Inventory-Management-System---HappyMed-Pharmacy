/**
 * Import opening stock counts from a Loyverse export as QUARANTINED batches.
 *
 * The export carries quantities but no lot numbers and no expiry dates, so every
 * batch created here gets a placeholder expiry of 2099-12-31 and is quarantined
 * immediately. Quarantined stock cannot be dispensed, which is the point: the
 * quantity is visible so the shelf can be reconciled, but nothing leaves the
 * pharmacy until a pharmacist has read the real expiry off the box and released
 * it. The placeholder is deliberately absurd rather than plausible - a date of
 * 2099 is obviously unverified, where 2027 would quietly pass for real.
 *
 * Stock is created through `receiveStock`, so each batch has a matching RECEIPT
 * movement and the ledger reconciles. Only the status is written directly.
 *
 * Every batch is lot-numbered OPENING-<SKU>, so the whole import can be undone:
 *   delete from "StockMovement" where "batchId" in
 *     (select id from "Batch" where "lotNumber" like 'OPENING-%');
 *   delete from "Batch" where "lotNumber" like 'OPENING-%';
 *
 *   npx tsx --conditions=react-server --env-file=.env \
 *     scripts/import-opening-stock.ts <file.csv> [--commit]
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/db";
import { receiveStock } from "@/lib/stock";

/** Obviously-not-real, so nobody mistakes it for a verified date. */
const PLACEHOLDER_EXPIRY = new Date(Date.UTC(2099, 11, 31));

const NOTE =
  "OPENING COUNT imported from Loyverse. Expiry NOT verified - read the real " +
  "expiry date off the box, correct it, then release from quarantine.";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const file = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!file) throw new Error("Usage: import-opening-stock.ts <file.csv> [--commit]");

  const owner = await prisma.user.findFirst({
    where: { role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) throw new Error("No active OWNER account to attribute the receipts to.");

  const rows = parseCsv(readFileSync(file, "utf8"));
  const head = rows[0].map((h) => h.trim());
  const store = head.find((h) => h.startsWith("Price ["))?.slice(7, -1) ?? "";
  const at = (n: string) => head.indexOf(n);
  const C = {
    sku: at("SKU"), name: at("Name"), cost: at("Cost"),
    stock: at(`In stock [${store}]`),
  };

  const toReceive: { sku: string; name: string; qty: number; cost: number }[] = [];
  const negative: string[] = [];
  const untracked: string[] = [];
  const fractional: string[] = [];

  for (const r of rows.slice(1)) {
    if (r.length < head.length || !r[C.sku]?.trim()) continue;
    const raw = r[C.stock];
    if (raw === "") { untracked.push(r[C.name]); continue; }

    const qty = Number.parseFloat(raw);
    if (!Number.isFinite(qty) || qty === 0) continue;
    if (qty < 0) { negative.push(`${r[C.name]} (${qty})`); continue; }
    if (!Number.isInteger(qty)) fractional.push(`${r[C.name]} (${qty})`);

    toReceive.push({
      sku: r[C.sku].trim(),
      name: r[C.name].trim(),
      qty: Math.round(qty),
      cost: Number.parseFloat(r[C.cost]) || 0,
    });
  }

  // Only import for products that actually exist in the catalogue.
  const known = new Map(
    (await prisma.product.findMany({ select: { id: true, sku: true } }))
      .map((p) => [p.sku, p.id]),
  );
  const missing = toReceive.filter((t) => !known.has(t.sku));
  const importable = toReceive.filter((t) => known.has(t.sku));

  console.log(`Items with stock  : ${toReceive.length}`);
  console.log(`Will import       : ${importable.length}`);
  console.log(`No such product   : ${missing.length}${missing.length ? " -> " + missing.map((m) => m.sku).join(", ") : ""}`);
  console.log(`Negative, skipped : ${negative.length}`);
  for (const n of negative) console.log(`  - ${n}`);
  console.log(`Not tracked       : ${untracked.length}`);
  if (fractional.length) {
    console.log(`Fractional, rounded: ${fractional.length}`);
    for (const f of fractional) console.log(`  - ${f}`);
  }
  console.log(`Total units       : ${importable.reduce((n, t) => n + t.qty, 0).toLocaleString()}`);
  console.log(`Expiry placeholder: ${PLACEHOLDER_EXPIRY.toISOString().slice(0, 10)} (all QUARANTINED)`);

  if (!commit) {
    console.log("\nDRY RUN - nothing written. Re-run with --commit.");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  let failed = 0;

  for (const t of importable) {
    try {
      const { batchId } = await receiveStock({
        productId: known.get(t.sku)!,
        lotNumber: `OPENING-${t.sku}`,
        expiryDate: PLACEHOLDER_EXPIRY,
        costPerUnit: t.cost.toFixed(4),
        quantity: t.qty,
        userId: owner.id,
        notes: NOTE,
      });

      // Quarantine only after the receipt, since receiveStock refuses to write
      // into a batch that is already blocked.
      await prisma.batch.update({
        where: { id: batchId },
        data: { status: "QUARANTINED", notes: NOTE },
      });

      done++;
      if (done % 50 === 0) console.log(`  ...${done}/${importable.length}`);
    } catch (e) {
      failed++;
      console.error(`  FAILED ${t.sku} ${t.name}: ${(e as Error).message}`);
    }
  }

  console.log(`\nImported ${done} quarantined batches, ${failed} failed.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
