import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  sessionCount: number;
  /** Resolved here rather than in the page: "now" is not a pure render input. */
  isLocked: boolean;
}

export async function listStaff(): Promise<StaffRow[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      lockedUntil: true,
      mustChangePassword: true,
      _count: { select: { sessions: true } },
    },
  });

  const now = Date.now();

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
    sessionCount: user._count.sessions,
    isLocked: user.lockedUntil !== null && user.lockedUntil.getTime() > now,
  }));
}
