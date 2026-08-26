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
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import {
  assertPermission,
  revokeAllSessionsForUser,
} from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const roleEnum = z.enum(["OWNER", "PHARMACIST", "STAFF"]);

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(100),
  email: z.email("Enter a valid email address."),
  role: roleEnum,
  password: z.string(),
});

/**
 * The pharmacy must never be left without someone who can administer it.
 * Every path that could remove the last owner goes through this check.
 */
async function wouldRemoveLastOwner(userId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!target || target.role !== "OWNER" || !target.isActive) return false;

  const otherActiveOwners = await prisma.user.count({
    where: { role: "OWNER", isActive: true, id: { not: userId } },
  });
  return otherActiveOwners === 0;
}

export async function createUserAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("user.manage");

    const parsed = createUserSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const strengthProblem = validatePasswordStrength(parsed.data.password);
    if (strengthProblem) {
      return actionError(strengthProblem, { password: strengthProblem });
    }

    const email = parsed.data.email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return actionError("That email address is already registered.", {
        email: "Already registered.",
      });
    }

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        role: parsed.data.role,
        passwordHash: await hashPassword(parsed.data.password),
        // They sign in with the password you set, then must choose their own.
        mustChangePassword: true,
      },
      select: { id: true, name: true, role: true },
    });

    await recordAudit({
      userId: actor.id,
      action: "user.create",
      entity: "User",
      entityId: created.id,
      summary: `Created ${ROLE_LABELS[created.role]} account for ${created.name}`,
      metadata: { email, role: created.role },
    });

    revalidatePath("/staff");
    return actionOk(undefined, `Account created for ${created.name}.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateUserRoleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("user.manage");

    const userId = String(formData.get("userId") ?? "");
    const parsedRole = roleEnum.safeParse(formData.get("role"));
    if (!userId || !parsedRole.success) return actionError("Invalid request.");

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!target) return actionError("That account no longer exists.");
    if (target.role === parsedRole.data) return actionOk(undefined, "No change.");

    // Demoting yourself out of Owner would lock you out of this very screen.
    if (target.id === actor.id && parsedRole.data !== "OWNER") {
      return actionError(
        "You cannot change your own role. Ask another owner to do it.",
      );
    }

    if (parsedRole.data !== "OWNER" && (await wouldRemoveLastOwner(userId))) {
      return actionError(
        "This is the only active owner. Promote someone else to Owner first.",
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role: parsedRole.data },
    });

    // Permissions are read from the session on every request, but roles are
    // cached per request; forcing a fresh sign-in makes the change unambiguous.
    await revokeAllSessionsForUser(userId);

    await recordAudit({
      userId: actor.id,
      action: "user.role_change",
      entity: "User",
      entityId: userId,
      summary: `Changed ${target.name} from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[parsedRole.data]}`,
      metadata: { from: target.role, to: parsedRole.data },
    });

    revalidatePath("/staff");
    return actionOk(
      undefined,
      `${target.name} is now ${ROLE_LABELS[parsedRole.data]}. They will need to sign in again.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function setUserActiveAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("user.manage");

    const userId = String(formData.get("userId") ?? "");
    const activate = formData.get("isActive") === "true";
    if (!userId) return actionError("Invalid request.");

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, isActive: true },
    });
    if (!target) return actionError("That account no longer exists.");

    if (target.id === actor.id && !activate) {
      return actionError("You cannot deactivate your own account.");
    }

    if (!activate && (await wouldRemoveLastOwner(userId))) {
      return actionError(
        "This is the only active owner. Promote someone else to Owner first.",
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: activate,
        // A reactivated account should not inherit an old lockout.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Deactivation must take effect now, not whenever their session lapses.
    const revoked = activate ? 0 : await revokeAllSessionsForUser(userId);

    await recordAudit({
      userId: actor.id,
      action: activate ? "user.activate" : "user.deactivate",
      entity: "User",
      entityId: userId,
      summary: activate
        ? `Reactivated the account for ${target.name}`
        : `Deactivated the account for ${target.name}, ending ${revoked} session(s)`,
    });

    revalidatePath("/staff");
    return actionOk(
      undefined,
      activate
        ? `${target.name} can sign in again.`
        : `${target.name} has been signed out everywhere.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetUserPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("user.manage");

    const userId = String(formData.get("userId") ?? "");
    const password = String(formData.get("password") ?? "");
    if (!userId) return actionError("Invalid request.");

    const problem = validatePasswordStrength(password);
    if (problem) return actionError(problem, { password: problem });

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!target) return actionError("That account no longer exists.");

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // An admin reset means the old password is no longer trusted, so every
    // existing session for that account has to go.
    await revokeAllSessionsForUser(userId);

    await recordAudit({
      userId: actor.id,
      action: "user.password_reset",
      entity: "User",
      entityId: userId,
      summary: `Reset the password for ${target.name}`,
    });

    revalidatePath("/staff");
    return actionOk(
      undefined,
      `Password reset. ${target.name} must choose a new one at next sign-in.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
