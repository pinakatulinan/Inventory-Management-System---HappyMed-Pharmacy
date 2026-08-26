import type { Metadata } from "next";

import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** Fall back to a short curated list if the runtime lacks Intl.supportedValuesOf. */
function supported(key: "timeZone" | "currency", fallback: string[]): string[] {
  const fn = (
    Intl as unknown as {
      supportedValuesOf?: (k: string) => string[];
    }
  ).supportedValuesOf;

  try {
    return fn ? fn(key) : fallback;
  } catch {
    return fallback;
  }
}

const COMMON_LOCALES = [
  "en-PH",
  "en-US",
  "en-GB",
  "en-AU",
  "en-SG",
  "fil-PH",
  "es-ES",
  "id-ID",
  "ms-MY",
  "th-TH",
  "vi-VN",
  "zh-CN",
];

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Pharmacy details and alert thresholds. Changes take effect immediately."
      />

      <div className="max-w-3xl">
        <SettingsForm
          settings={settings}
          timeZones={supported("timeZone", ["Asia/Manila", "UTC"])}
          currencies={supported("currency", ["PHP", "USD", "EUR"])}
          locales={COMMON_LOCALES}
        />
      </div>
    </>
  );
}
