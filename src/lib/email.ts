import "server-only";

/**
 * Email delivery.
 *
 * Deliberately provider-agnostic and dependency-free: it speaks Resend's HTTP
 * API directly when RESEND_API_KEY is set, and otherwise logs the message and
 * reports that it was skipped. That means the digest is fully built and
 * testable before anyone picks an email provider, and swapping provider is one
 * function rather than a package migration.
 */

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export type EmailResult =
  | { delivered: true; id: string | null }
  | { delivered: false; reason: string };

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (message.to.length === 0) {
    return { delivered: false, reason: "no recipients configured" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL;

  if (!apiKey || !from) {
    console.info(
      `[email] not configured; would have sent "${message.subject}" to ${message.to.join(", ")}`,
    );
    return {
      delivered: false,
      reason: "RESEND_API_KEY or DIGEST_FROM_EMAIL not set",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[email] provider rejected the message: ${response.status} ${body}`);
      return {
        delivered: false,
        reason: `provider returned ${response.status}`,
      };
    }

    const data = (await response.json()) as { id?: string };
    return { delivered: true, id: data.id ?? null };
  } catch (error) {
    // A failed digest must never take down the whole nightly job.
    console.error("[email] delivery failed:", error);
    return { delivered: false, reason: "network or provider error" };
  }
}
