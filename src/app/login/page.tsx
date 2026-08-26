import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock, PackageSearch, ShieldCheck } from "lucide-react";

import { LoginForm } from "@/app/login/login-form";
import { BrandMark, BrandWordmark } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

const HIGHLIGHTS = [
  {
    icon: CalendarClock,
    title: "Expiry alerts",
    body: "Every batch is tracked to its own expiry date, with warnings long before stock is at risk.",
  },
  {
    icon: PackageSearch,
    title: "Accurate stock",
    body: "Receiving and dispensing are recorded as movements, so the count always explains itself.",
  },
  {
    icon: ShieldCheck,
    title: "Full audit trail",
    body: "Every change is attributed to the person who made it, with the reason they gave.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in? Skip the form.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { next } = await searchParams;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel - decorative, hidden on the small screens staff use least */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-700 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.22), transparent 50%)",
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <BrandMark className="bg-white/15 text-white" />
          <span className="text-lg font-semibold tracking-tight">
            HappyMed Pharmacy
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Know what is on the shelf, and what is about to expire.
          </h1>
          <p className="mt-4 text-brand-100">
            Inventory management built around batch-level expiry tracking.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm text-brand-100">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-brand-200">
          Authorised staff only.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <BrandWordmark />
          </div>

          <div className="mt-8 lg:mt-0">
            <h2 className="text-2xl font-semibold tracking-tight">
              Sign in
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use the account the pharmacy owner set up for you.
            </p>
          </div>

          <div className="mt-8">
            <LoginForm next={next} />
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Forgotten your password? Ask the pharmacy owner to reset it for you.
          </p>
        </div>
      </main>
    </div>
  );
}
