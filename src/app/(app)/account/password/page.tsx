import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { PasswordForm } from "@/app/(app)/account/password/password-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ forced?: string }>;
}) {
  const user = await requireUser();
  const { forced } = await searchParams;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true },
  });

  const mustChange = record?.mustChangePassword ?? false;

  return (
    <>
      <PageHeader
        title="Change password"
        description="Changing your password signs you out of every other device."
      />

      <div className="max-w-lg space-y-4">
        {mustChange || forced ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-status-warning-border bg-status-warning-soft px-4 py-3 text-sm text-status-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Your password was set by someone else. Choose your own before you
              continue, so nobody else knows how to sign in as you.
            </p>
          </div>
        ) : null}

        <PasswordForm />
      </div>
    </>
  );
}
