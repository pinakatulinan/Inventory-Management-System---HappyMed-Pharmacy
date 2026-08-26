import Link from "next/link";
import { ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Rendered by forbidden() with a 403 status. Deliberately explains what to do
 * next: staff hitting an owner-only page need to know who to ask, not just
 * that they were refused.
 */
export default function Forbidden() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <span
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-status-expired-soft text-status-expired"
          aria-hidden
        >
          <ShieldX className="size-6" />
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          You do not have access to this page
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Your account role does not include this permission. If you need it,
          ask the pharmacy owner to change your role or to make the change for
          you.
        </p>

        <div className="mt-8">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
