import "server-only";

import type { EmailMessage } from "@/lib/email";
import { formatCivilDate } from "@/lib/dates";
import { EXPIRY_STATUS_META, formatDaysLeft } from "@/lib/expiry";
import { getLowStockProducts } from "@/lib/queries/dashboard";
import { getExpiringBatches, getExpirySummary } from "@/lib/queries/expiry";
import type { AppSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/units";

/**
 * The daily expiry digest.
 *
 * Written to be read on a phone at 6am: the headline is the count that needs
 * action, the detail is a plain table, and if there is nothing to report it
 * says so in one line rather than sending an empty table.
 *
 * Emails are rendered with inline styles and a table layout because that is
 * what mail clients reliably support - the app's CSS tokens do not apply here.
 */

const ROW_LIMIT = 40;

export interface DigestContent extends EmailMessage {
  /** False when nothing needs attention, so the caller can skip sending. */
  worthSending: boolean;
}

export async function buildExpiryDigest(
  settings: AppSettings,
  recipients: string[],
): Promise<DigestContent> {
  const [summary, batches, lowStock] = await Promise.all([
    getExpirySummary(settings),
    getExpiringBatches(settings, { limit: ROW_LIMIT }),
    getLowStockProducts(15),
  ]);

  const money = (n: number) =>
    formatMoney(n, settings.currency, settings.locale);

  const needsAttention = summary.expired + summary.critical;
  const worthSending = needsAttention > 0 || lowStock.length > 0;

  const subject = worthSending
    ? `${settings.pharmacyName}: ${needsAttention} batch${needsAttention === 1 ? "" : "es"} need attention`
    : `${settings.pharmacyName}: nothing expiring, stock levels fine`;

  // ---- Plain text ---------------------------------------------------------
  const textLines: string[] = [
    `${settings.pharmacyName} - daily stock report`,
    formatCivilDate(settings.todayDate, settings.locale),
    "",
    `Expired on shelf:   ${summary.expired}`,
    `Expiring <= ${settings.expiry.criticalDays}d:   ${summary.critical}`,
    `Expiring <= ${settings.expiry.warningDays}d:   ${summary.warning}`,
    `Value at risk:      ${money(summary.valueAtRisk)}`,
    "",
  ];

  if (batches.length > 0) {
    textLines.push("BATCHES TO REVIEW");
    for (const b of batches) {
      textLines.push(
        `  [${EXPIRY_STATUS_META[b.assessment.status].label}] ${b.brandName ?? b.genericName} ` +
          `lot ${b.lotNumber} - ${b.quantityOnHand} ${b.baseUnit} - ` +
          `${formatCivilDate(b.expiryDate, settings.locale)} (${formatDaysLeft(b.assessment.daysLeft)})`,
      );
    }
    textLines.push("");
  }

  if (lowStock.length > 0) {
    textLines.push("NEEDS REORDERING");
    for (const p of lowStock) {
      textLines.push(
        `  ${p.brandName ?? p.genericName}: ${p.onHand} of ${p.reorderPoint} ${p.baseUnit}` +
          (p.supplierName ? ` (${p.supplierName})` : ""),
      );
    }
    textLines.push("");
  }

  if (!worthSending) {
    textLines.push("Nothing needs attention today.");
  }

  // ---- HTML ---------------------------------------------------------------
  const tile = (label: string, value: string, colour: string) => `
    <td style="padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <div style="font-size:12px;color:#64748b;">${label}</div>
      <div style="font-size:24px;font-weight:600;color:${colour};">${value}</div>
    </td>`;

  const batchRows = batches
    .map((b) => {
      const meta = EXPIRY_STATUS_META[b.assessment.status];
      const colour =
        b.assessment.status === "EXPIRED"
          ? "#b91c1c"
          : b.assessment.status === "CRITICAL"
            ? "#c2410c"
            : "#a16207";

      return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">
          <strong>${escapeHtml(b.brandName ?? b.genericName)}</strong><br>
          <span style="font-size:12px;color:#64748b;">${escapeHtml(b.genericName)}${b.strength ? ` &middot; ${escapeHtml(b.strength)}` : ""}</span>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${escapeHtml(b.lotNumber)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${b.quantityOnHand} ${escapeHtml(b.baseUnit)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${formatCivilDate(b.expiryDate, settings.locale)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:${colour};font-weight:600;white-space:nowrap;">
          ${meta.label}<br><span style="font-weight:400;font-size:12px;">${formatDaysLeft(b.assessment.daysLeft)}</span>
        </td>
      </tr>`;
    })
    .join("");

  const lowStockRows = lowStock
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(p.brandName ?? p.genericName)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;">${escapeHtml(p.supplierName ?? "No supplier set")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:${p.onHand <= 0 ? "#b91c1c" : "#c2410c"};">
          ${p.onHand} <span style="font-weight:400;color:#64748b;">of ${p.reorderPoint}</span>
        </td>
      </tr>`,
    )
    .join("");

  const appUrl = process.env.APP_URL ?? "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
    <h1 style="margin:0 0 4px;font-size:18px;">${escapeHtml(settings.pharmacyName)}</h1>
    <p style="margin:0 0 20px;color:#64748b;font-size:13px;">
      Daily stock report &middot; ${formatCivilDate(settings.todayDate, settings.locale)}
    </p>

    <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-bottom:24px;">
      <tr>
        ${tile("Expired", String(summary.expired), summary.expired > 0 ? "#b91c1c" : "#047857")}
        ${tile(`Within ${settings.expiry.criticalDays}d`, String(summary.critical), summary.critical > 0 ? "#c2410c" : "#047857")}
        ${tile("Value at risk", money(summary.valueAtRisk), "#0f172a")}
      </tr>
    </table>

    ${
      batches.length > 0
        ? `<h2 style="font-size:14px;margin:0 0 8px;">Batches to review</h2>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
      <thead><tr style="text-align:left;color:#64748b;font-size:12px;">
        <th style="padding:6px 10px;">Item</th><th style="padding:6px 10px;">Lot</th>
        <th style="padding:6px 10px;text-align:right;">On hand</th>
        <th style="padding:6px 10px;">Expires</th><th style="padding:6px 10px;">Status</th>
      </tr></thead>
      <tbody>${batchRows}</tbody>
    </table>`
        : `<p style="color:#047857;font-size:14px;margin-bottom:24px;">Nothing is expiring within ${settings.expiry.warningDays} days.</p>`
    }

    ${
      lowStock.length > 0
        ? `<h2 style="font-size:14px;margin:0 0 8px;">Needs reordering</h2>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
      <thead><tr style="text-align:left;color:#64748b;font-size:12px;">
        <th style="padding:6px 10px;">Item</th><th style="padding:6px 10px;">Supplier</th>
        <th style="padding:6px 10px;text-align:right;">On hand</th>
      </tr></thead>
      <tbody>${lowStockRows}</tbody>
    </table>`
        : ""
    }

    ${
      appUrl
        ? `<a href="${escapeHtml(appUrl)}/expiry" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">Open expiry alerts</a>`
        : ""
    }

    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">
      Sent automatically by the ${escapeHtml(settings.pharmacyName)} inventory system.
      Change recipients or switch this off in Settings.
    </p>
  </div>
</body></html>`;

  return {
    to: recipients,
    subject,
    html,
    text: textLines.join("\n"),
    worthSending,
  };
}

/** Values come from the database, so escape before interpolating into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
