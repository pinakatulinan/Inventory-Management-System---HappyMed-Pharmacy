import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import {
  DEFAULT_EXPIRY_THRESHOLDS,
  todayInZone,
  type ExpiryThresholds,
} from "@/lib/expiry";

/**
 * Runtime configuration the pharmacist can change without a deploy.
 *
 * These defaults are a starting point, not a decision baked into the code -
 * every one of them is editable in Settings.
 */
export const SETTING_DEFAULTS = {
  "pharmacy.name": "HappyMed Pharmacy",
  /** IANA timezone. Decides when "today" rolls over for expiry checks. */
  "pharmacy.timezone": "Asia/Manila",
  "pharmacy.currency": "PHP",
  "pharmacy.locale": "en-PH",
  /** Days before expiry at which a batch becomes CRITICAL. */
  "expiry.criticalDays": "30",
  /** Days before expiry at which a batch becomes a WARNING. */
  "expiry.warningDays": "90",
  /** Send the daily expiry digest email. */
  "alerts.digestEnabled": "false",
  /** Comma-separated recipients for the digest. */
  "alerts.digestRecipients": "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export interface AppSettings {
  pharmacyName: string;
  timeZone: string;
  currency: string;
  locale: string;
  expiry: ExpiryThresholds;
  digestEnabled: boolean;
  digestRecipients: string[];
  /** Today in the pharmacy timezone, as an epoch day. */
  todayEpochDay: number;
  /** Today in the pharmacy timezone, as a UTC-midnight Date for date queries. */
  todayDate: Date;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Cached per request, so the dozens of components that need the currency or the
 * expiry thresholds share a single query.
 */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const read = (key: SettingKey): string =>
    map.get(key) ?? SETTING_DEFAULTS[key];

  let timeZone = read("pharmacy.timezone");
  try {
    // A bad timezone would silently poison every expiry calculation, so prove
    // it resolves before we depend on it.
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  } catch {
    timeZone = "UTC";
  }

  const criticalDays = parsePositiveInt(
    map.get("expiry.criticalDays"),
    DEFAULT_EXPIRY_THRESHOLDS.criticalDays,
  );
  let warningDays = parsePositiveInt(
    map.get("expiry.warningDays"),
    DEFAULT_EXPIRY_THRESHOLDS.warningDays,
  );

  // A warning window inside the critical window would make WARNING unreachable.
  if (warningDays < criticalDays) warningDays = criticalDays;

  const todayEpochDay = todayInZone(timeZone);

  return {
    pharmacyName: read("pharmacy.name"),
    timeZone,
    currency: read("pharmacy.currency"),
    locale: read("pharmacy.locale"),
    expiry: { criticalDays, warningDays },
    digestEnabled: read("alerts.digestEnabled") === "true",
    digestRecipients: read("alerts.digestRecipients")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    todayEpochDay,
    todayDate: new Date(todayEpochDay * 86_400_000),
  };
});

export async function updateSettings(
  values: Partial<Record<SettingKey, string>>,
): Promise<void> {
  const entries = Object.entries(values) as [SettingKey, string][];

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
  );
}
