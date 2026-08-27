/**
 * Import a Loyverse item export into the product catalogue.
 *
 * Imports the CATALOGUE ONLY - products, prices, reorder points. It deliberately
 * does not create batches, because the export carries no lot numbers and no
 * expiry dates, and this system's entire purpose is tracking those. Inventing an
 * expiry date would produce a system that looks like it is watching expiry while
 * silently reporting every item as fine, which is worse than one that admits it
 * has no stock yet.
 *
 * Stock arrives afterwards through Receive stock, during a physical count -
 * which is the only place lot numbers and expiry dates actually exist.
 *
 *   npx tsx --conditions=react-server --env-file=.env \
 *     scripts/import-loyverse.ts <file.csv> [--commit]
 *
 * Without --commit it reports what it would do and writes nothing.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/db";
import type { DosageForm } from "@/generated/prisma/enums";

/** RFC-4180-ish parser: handles quoted fields and embedded commas. */
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

/** Strength as printed on the box: 500mg, 125mg/5mL, 10mg/2mg/500mg, 0.5%. */
const STRENGTH = /(\d+(?:\.\d+)?\s*(?:mcg|mg|g|mL|ml|IU|%)(?:\s*\/\s*\d*\.?\d*\s*(?:mcg|mg|mL|ml|g))*)/;

function strengthOf(name: string): string | null {
  const m = name.match(STRENGTH);
  return m ? m[1].replace(/\s+/g, "") : null;
}

/**
 * Dosage form from wording on the label. Ordered most- to least-specific, since
 * "Syrup 60mL" must read as SYRUP rather than being caught by the mL rule.
 */
const FORM_RULES: [RegExp, DosageForm][] = [
  [/\bcapsule|\bcap\b|softgel/i, "CAPSULE"],
  [/\btablet|\btab\b|chewable|film[- ]coated|\bfc\b/i, "TABLET"],
  [/\bsyrup|\bsyr\b/i, "SYRUP"],
  [/suspension|\bsusp\b/i, "SUSPENSION"],
  [/\bdrops?\b/i, "DROPS"],
  [/lozenge/i, "LOZENGE"],
  [/ointment/i, "OINTMENT"],
  [/\bcream\b/i, "CREAM"],
  [/\bgel\b/i, "GEL"],
  [/inhaler/i, "INHALER"],
  [/suppositor/i, "SUPPOSITORY"],
  [/\bpatch\b/i, "PATCH"],
  [/sachet|powder/i, "POWDER"],
  [/\bvial\b|ampoule|\bneb\b|\bIU\b|injection/i, "INJECTION"],
  [/solution|\bsol\b|\bmL\b|\bml\b/i, "SOLUTION"],
];

function formOf(name: string): DosageForm {
  for (const [re, form] of FORM_RULES) if (re.test(name)) return form;
  return "OTHER";
}

/** Loyverse tags everything Branded / Generic / Others; blank is common. */
function categoryOf(raw: string): string {
  const c = raw.trim();
  return c === "" ? "Uncategorised" : c;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface Row {
  sku: string;
  name: string;
  category: string;
  description: string;
  cost: number;
  price: number;
  inStock: number | null;
  lowStock: number;
  barcode: string;
  trackStock: boolean;
}

async function main() {
  const file = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!file) throw new Error("Usage: import-loyverse.ts <file.csv> [--commit]");

  const rows = parseCsv(readFileSync(file, "utf8"));
  const head = rows[0].map((h) => h.trim());
  const at = (n: string) => {
    const i = head.indexOf(n);
    if (i < 0) throw new Error(`Column not found: ${n}`);
    return i;
  };

  const store = head.find((h) => h.startsWith("Price ["))?.slice(7, -1) ?? "";
  const C = {
    sku: at("SKU"), name: at("Name"), cat: at("Category"), desc: at("Description"),
    cost: at("Cost"), barcode: at("Barcode"), track: at("Track stock"),
    price: at(`Price [${store}]`), stock: at(`In stock [${store}]`), low: at(`Low stock [${store}]`),
  };

  const parsed: Row[] = [];
  const skipped: { name: string; why: string }[] = [];

  for (const r of rows.slice(1)) {
    if (r.length < head.length || !r[C.name]?.trim()) continue;
    const price = Number.parseFloat(r[C.price]);
    const stock = r[C.stock] === "" ? null : Number.parseFloat(r[C.stock]);

    if (!Number.isFinite(price)) {
      skipped.push({ name: r[C.name], why: `price is "${r[C.price]}"` });
      continue;
    }
    if (!r[C.sku]?.trim()) {
      skipped.push({ name: r[C.name], why: "no SKU" });
      continue;
    }

    parsed.push({
      sku: r[C.sku].trim(),
      name: r[C.name].trim(),
      category: categoryOf(r[C.cat]),
      description: stripHtml(r[C.desc] ?? ""),
      cost: Number.parseFloat(r[C.cost]) || 0,
      price,
      inStock: stock,
      lowStock: Math.max(0, Math.round(Number.parseFloat(r[C.low]) || 0)),
      barcode: (r[C.barcode] ?? "").trim(),
      trackStock: (r[C.track] ?? "").trim().toUpperCase() === "Y",
    });
  }

  const categories = [...new Set(parsed.map((p) => p.category))].sort();
  const forms: Record<string, number> = {};
  for (const p of parsed) {
    const f = formOf(p.name);
    forms[f] = (forms[f] ?? 0) + 1;
  }

  const negative = parsed.filter((p) => (p.inStock ?? 0) < 0);
  const withStock = parsed.filter((p) => (p.inStock ?? 0) > 0);

  console.log(`Store column     : ${store}`);
  console.log(`Rows parsed      : ${parsed.length}`);
  console.log(`Skipped          : ${skipped.length}`);
  for (const s of skipped) console.log(`  - ${s.name} (${s.why})`);
  console.log(`Categories       : ${categories.join(", ")}`);
  console.log(`Items with stock : ${withStock.length} (NOT imported - see below)`);
  console.log(`Negative stock   : ${negative.length}`);
  console.log();
  console.log("Dosage forms detected:");
  console.table(forms);

  console.log("\nSample of what will be created:\n");
  for (const p of parsed.slice(0, 8)) {
    console.log(
      `  ${p.sku}  ${p.name}\n` +
      `        category=${p.category}  form=${formOf(p.name)}  ` +
      `strength=${strengthOf(p.name) ?? "-"}  price=${p.price.toFixed(2)}  reorder=${p.lowStock}`,
    );
  }

  if (!commit) {
    console.log("\nDRY RUN - nothing written. Re-run with --commit to import.");
    await prisma.$disconnect();
    return;
  }

  // ---- write ----
  const catIds = new Map<string, string>();
  for (const name of categories) {
    const c = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, description: "Imported from Loyverse." },
    });
    catIds.set(name, c.id);
  }

  let created = 0;
  let updated = 0;

  for (const p of parsed) {
    const notes = [p.description, p.barcode ? `Barcode: ${p.barcode}` : ""]
      .filter(Boolean)
      .join(" · ");

    const data = {
      genericName: p.name,
      strength: strengthOf(p.name),
      dosageForm: formOf(p.name),
      description: notes || null,
      categoryId: catIds.get(p.category)!,
      baseUnit: "piece",
      packUnit: null,
      unitsPerPack: 1,
      sellingPrice: p.price.toFixed(4),
      reorderPoint: p.lowStock,
      isActive: p.trackStock,
    };

    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (existing) {
      await prisma.product.update({ where: { sku: p.sku }, data });
      updated++;
    } else {
      await prisma.product.create({ data: { sku: p.sku, ...data } });
      created++;
    }
  }

  console.log(`\nCreated ${created} products, updated ${updated}.`);
  console.log("No stock was imported. Enter it through Receive stock, with real lot numbers and expiry dates.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
