"use server";

import { z } from "zod";

import {
  actionError,
  actionOk,
  fieldErrorsFrom,
  toActionError,
  type ActionResult,
} from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/password";
import {
  createSession,
  getCurrentUser,
  revokeAllSessionsForUser,
} from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(1, "Enter a new password."),
    confirmPassword: z.string().min(1, "Confirm the new password."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });

export async function changePasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return actionError("Your session has expired. Sign in again.");

    const parsed = schema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });

    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!record) return actionError("Your account no longer exists.");

    // Proving knowledge of the current password is what stops an unattended
    // terminal being used to take over the account.
    const currentOk = await verifyPassword(
      parsed.data.currentPassword,
      record.passwordHash,
    );
    if (!currentOk) {
      return actionError("That is not your current password.", {
        currentPassword: "Incorrect.",
      });
    }

    const problem = validatePasswordStrength(parsed.data.newPassword);
    if (problem) return actionError(problem, { newPassword: problem });

    if (parsed.data.newPassword === parsed.data.currentPassword) {
      return actionError("The new password must be different.", {
        newPassword: "Must differ from the current password.",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(parsed.data.newPassword),
        mustChangePassword: false,
      },
    });

    // Changing a password should end every other session - that is the whole
    // point of changing it. Then re-issue one for the browser doing the change,
    // so the person is not bounced back to the login screen.
    await revokeAllSessionsForUser(user.id);
    await createSession(user.id);

    await recordAudit({
      userId: user.id,
      action: "user.password_change",
      entity: "User",
      entityId: user.id,
      summary: "Changed their own password, ending all other sessions",
    });

    return actionOk(
      undefined,
      "Password changed. Any other devices have been signed out.",
    );
  } catch (error) {
    return toActionError(error);
  }
}
