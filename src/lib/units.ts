/**
 * Quantity and money formatting.
 *
 * Every quantity in the database is an integer count of BASE UNITS (tablets,
 * millilitres, pieces). Packs exist only at the edges: how staff receive stock
 * and how they read a shelf. Converting at the boundary - never in storage -
 * is what keeps the ledger exact when the pharmacy dispenses loose units.
 */

export interface PackSpec {
  baseUnit: string;
  packUnit?: string | null;
  unitsPerPack: number;
}

function plural(count: number, unit: string): string {
  if (Math.abs(count) === 1) return unit;
  // Good enough for the units a pharmacy actually uses.
  if (unit.endsWith("s") || unit.endsWith("x")) return `${unit}es`;
  return `${unit}s`;
}

/** "250 tablets" */
export function formatBaseUnits(quantity: number, spec: PackSpec): string {
  return `${quantity.toLocaleString()} ${plural(quantity, spec.baseUnit)}`;
}

/**
 * Human-readable breakdown for shelf counting: "250 tablets (2 boxes + 50)".
 * Falls back to plain base units when the product has no pack concept.
 */
export function formatQuantity(quantity: number, spec: PackSpec): string {
  const base = formatBaseUnits(quantity, spec);

  if (!spec.packUnit || spec.unitsPerPack <= 1) return base;

  const packs = Math.floor(quantity / spec.unitsPerPack);
  const loose = quantity % spec.unitsPerPack;

  if (packs === 0) return base;

  const packPart = `${packs} ${plural(packs, spec.packUnit)}`;
  return loose === 0
    ? `${base} (${packPart})`
    : `${base} (${packPart} + ${loose})`;
}

/** Convert a "packs and loose units" entry into base units. */
export function toBaseUnits(
  packs: number,
  looseUnits: number,
  unitsPerPack: number,
): number {
  return Math.trunc(packs) * Math.max(1, Math.trunc(unitsPerPack)) + Math.trunc(looseUnits);
}

/** Inverse of toBaseUnits, for pre-filling receiving forms. */
export function fromBaseUnits(
  quantity: number,
  unitsPerPack: number,
): { packs: number; looseUnits: number } {
  const perPack = Math.max(1, Math.trunc(unitsPerPack));
  return {
    packs: Math.floor(quantity / perPack),
    looseUnits: quantity % perPack,
  };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Prisma Decimal, a plain number, or a decimal string from a form. */
export type MoneyLike = { toString(): string } | number | string;

export function toNumber(value: MoneyLike): number {
  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * Display only. All money arithmetic stays in Postgres `numeric` / Prisma
 * Decimal so rounding never accumulates across a stock valuation report.
 */
export function formatMoney(
  value: MoneyLike,
  currency: string,
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

/** Unit prices are stored at 4dp; show the extra precision only when it exists. */
export function formatUnitPrice(
  value: MoneyLike,
  currency: string,
  locale?: string,
): string {
  const n = toNumber(value);
  const hasSubCents = Math.abs(n * 100 - Math.round(n * 100)) > 1e-9;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: hasSubCents ? 4 : 2,
  }).format(n);
}
