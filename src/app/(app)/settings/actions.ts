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
import { updateSettings, type SettingKey } from "@/lib/settings";

/**
 * A bad timezone, currency or locale would not fail loudly - it would quietly
 * poison every date and price in the app. So each is proved to work by actually
 * running it through Intl before it is allowed into the database.
 */
const isValidTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const isValidCurrency = (value: string) => {
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: value }).format(1);
    return true;
  } catch {
    return false;
  }
};

const isValidLocale = (value: string) => {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([value]).length > 0;
  } catch {
    return false;
  }
};

const settingsSchema = z
  .object({
    pharmacyName: z.string().trim().min(2, "Enter the pharmacy name.").max(120),
    timeZone: z
      .string()
      .trim()
      .refine(isValidTimeZone, "Not a recognised timezone (e.g. Asia/Manila)."),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isValidCurrency, "Not a recognised ISO currency code (e.g. PHP)."),
    locale: z
      .string()
      .trim()
      .refine(isValidLocale, "Not a recognised locale (e.g. en-PH)."),
    criticalDays: z.coerce
      .number()
      .int("Whole days only.")
      .min(1, "Must be at least 1 day.")
      .max(3650),
    warningDays: z.coerce
      .number()
      .int("Whole days only.")
      .min(1, "Must be at least 1 day.")
      .max(3650),
    digestEnabled: z.boolean(),
    digestRecipients: z.string().trim(),
  })
  .refine((data) => data.warningDays >= data.criticalDays, {
    path: ["warningDays"],
    message: "The warning window must be at least as long as the critical one.",
  });

export async function updateSettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("settings.manage");

    const parsed = settingsSchema.safeParse({
      pharmacyName: formData.get("pharmacyName"),
      timeZone: formData.get("timeZone"),
      currency: formData.get("currency"),
      locale: formData.get("locale"),
      criticalDays: formData.get("criticalDays"),
      warningDays: formData.get("warningDays"),
      digestEnabled: formData.get("digestEnabled") === "on",
      digestRecipients: formData.get("digestRecipients") ?? "",
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const recipients = parsed.data.digestRecipients
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const invalid = recipients.filter(
      (email) => !z.email().safeParse(email).success,
    );
    if (invalid.length > 0) {
      return actionError("Check the digest recipients.", {
        digestRecipients: `Not valid email addresses: ${invalid.join(", ")}`,
      });
    }

    if (parsed.data.digestEnabled && recipients.length === 0) {
      return actionError("Add at least one recipient for the digest.", {
        digestRecipients: "Required when the digest is switched on.",
      });
    }

    const previous = await prisma.setting.findMany();
    const before = Object.fromEntries(previous.map((s) => [s.key, s.value]));

    const next: Partial<Record<SettingKey, string>> = {
      "pharmacy.name": parsed.data.pharmacyName,
      "pharmacy.timezone": parsed.data.timeZone,
      "pharmacy.currency": parsed.data.currency,
      "pharmacy.locale": parsed.data.locale,
      "expiry.criticalDays": String(parsed.data.criticalDays),
      "expiry.warningDays": String(parsed.data.warningDays),
      "alerts.digestEnabled": String(parsed.data.digestEnabled),
      "alerts.digestRecipients": recipients.join(","),
    };

    await updateSettings(next);

    const changed = Object.entries(next).filter(
      ([key, value]) => before[key] !== value,
    );

    if (changed.length > 0) {
      await recordAudit({
        userId: actor.id,
        action: "settings.update",
        entity: "Setting",
        summary: `Updated ${changed.length} setting(s): ${changed.map(([k]) => k).join(", ")}`,
        metadata: Object.fromEntries(
          changed.map(([key, value]) => [key, { from: before[key] ?? null, to: value }]),
        ),
      });
    }

    // Thresholds and currency are read on nearly every screen.
    revalidatePath("/", "layout");

    return actionOk(
      undefined,
      changed.length === 0 ? "No changes to save." : "Settings saved.",
    );
  } catch (error) {
    return toActionError(error);
  }
}
