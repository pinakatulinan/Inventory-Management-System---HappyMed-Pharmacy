import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AuthorizationError, can, type Permission } from "@/lib/auth/rbac";

export const SESSION_COOKIE = "happymed_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * The cookie carries a random opaque token; the database stores only its
 * SHA-256. A dump of the sessions table therefore cannot be replayed as a
 * login. SHA-256 without a salt is correct here - the token is already 256
 * bits of entropy, so there is nothing to brute-force.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const headerList = await headers();

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ipAddress:
        headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: headerList.get("user-agent")?.slice(0, 500) ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    // deleteMany, not delete: a stale cookie must not throw on logout.
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user. Wrapped in React `cache` so the many Server
 * Components on a page share one database round-trip per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: { id: true, email: true, name: true, role: true, isActive: true },
      },
    },
  });

  if (!session) return null;

  // Expired sessions are cleaned up lazily here and in bulk by the daily cron.
  if (session.expiresAt.getTime() <= Date.now()) return null;

  // A deactivated account loses access immediately, without waiting for the
  // session to lapse.
  if (!session.user.isActive) return null;

  const { id, email, name, role } = session.user;
  return { id, email, name, role };
});

/** For pages: bounce to the login screen, preserving where they were headed. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = returnTo
      ? `/login?next=${encodeURIComponent(returnTo)}`
      : "/login";
    redirect(target);
  }
  return user;
}

/**
 * For pages: authenticated *and* authorised.
 *
 * Renders the 403 page rather than throwing, so a staff member who guesses an
 * owner-only URL gets a clear explanation and the right status code instead of
 * a generic error screen.
 */
export async function requirePermission(
  permission: Permission,
  returnTo?: string,
): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!can(user.role, permission)) {
    forbidden();
  }
  return user;
}

/**
 * For Server Actions, where there is no page to render: throws instead, so the
 * action can report the failure to the caller.
 */
export async function assertPermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError(permission);
  if (!can(user.role, permission)) throw new AuthorizationError(permission);
  return user;
}

/** Housekeeping for the daily cron. */
export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
}

/** Sign a user out of every device - used when deactivating an account. */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}
