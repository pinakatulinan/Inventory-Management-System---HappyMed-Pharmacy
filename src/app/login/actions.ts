"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { attemptLogin } from "@/lib/auth/login";

export interface LoginFormState {
  error?: string;
}

const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/**
 * Only same-origin paths are accepted, so a crafted `?next=` cannot bounce a
 * freshly authenticated pharmacist to an attacker's site. `//evil.com` is a
 * protocol-relative URL, hence the second check.
 */
function safeRedirectTarget(next: string | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const result = await attemptLogin(parsed.data.email, parsed.data.password);

  if (!result.ok) {
    return { error: result.error };
  }

  // redirect() signals by throwing, so it must sit outside any try/catch.
  redirect(
    result.mustChangePassword
      ? "/account/password?forced=1"
      : safeRedirectTarget(parsed.data.next),
  );
}
