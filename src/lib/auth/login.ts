import "server-only";

import { headers } from "next/headers";

import { recordAudit } from "@/lib/audit";
import { fakeVerify, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * Lock the account for a while after repeated failures. Five attempts is
 * generous enough for a mistyped password on a counter keyboard and short
 * enough to make online guessing pointless.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export type LoginResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: string };

/**
 * Every failure path returns the same message on purpose. Telling an attacker
 * whether the email exists, or whether the account is merely deactivated, hands
 * them half the credential for free.
 */
const GENERIC_FAILURE = "Incorrect email or password.";

export async function attemptLogin(
  email: string,
  password: string,
): Promise<LoginResult> {
  const normalisedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalisedEmail },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      mustChangePassword: true,
    },
  });

  if (!user) {
    // Spend the same time we would have spent on a real bcrypt comparison, so
    // the response time does not reveal which emails are registered.
    await fakeVerify(password);
    return { ok: false, error: GENERIC_FAILURE };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60_000,
    );
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);

  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : null,
      },
    });

    if (shouldLock) {
      const headerList = await headers();
      await recordAudit({
        userId: user.id,
        action: "auth.lockout",
        entity: "User",
        entityId: user.id,
        summary: `Account locked for ${LOCKOUT_MINUTES} minutes after ${MAX_FAILED_ATTEMPTS} failed sign-in attempts`,
        ipAddress:
          headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      });

      return {
        ok: false,
        error: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
      };
    }

    return { ok: false, error: GENERIC_FAILURE };
  }

  // Correct password, but the account is switched off. Checked after the
  // password so a deactivated account is not detectable without the password.
  if (!user.isActive) {
    return {
      ok: false,
      error: "This account has been deactivated. Contact the pharmacy owner.",
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  await createSession(user.id);

  const headerList = await headers();
  await recordAudit({
    userId: user.id,
    action: "auth.login",
    entity: "User",
    entityId: user.id,
    summary: "Signed in",
    ipAddress: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return { ok: true, mustChangePassword: user.mustChangePassword };
}
