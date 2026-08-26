"use server";

import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { destroySession, getCurrentUser } from "@/lib/auth/session";

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();

  if (user) {
    await recordAudit({
      userId: user.id,
      action: "auth.logout",
      entity: "User",
      entityId: user.id,
      summary: "Signed out",
    });
  }

  await destroySession();
  redirect("/login");
}
