import Link from "next/link";
import {
  Boxes,
  CalendarClock,
  HandCoins,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";

import { can, type Permission } from "@/lib/auth/rbac";
import type { Role } from "@/generated/prisma/enums";

const ACTIONS: {
  href: string;
  label: string;
  help: string;
  icon: LucideIcon;
  permission: Permission;
}[] = [
  {
    href: "/dispense",
    label: "Dispense",
    help: "Give items to a customer",
    icon: HandCoins,
    permission: "stock.dispense",
  },
  {
    href: "/receive",
    label: "Receive stock",
    help: "A delivery arrived",
    icon: PackagePlus,
    permission: "stock.receive",
  },
  {
    href: "/inventory",
    label: "Check stock",
    help: "How many are left?",
    icon: Boxes,
    permission: "inventory.view",
  },
  {
    href: "/expiry",
    label: "Expiring soon",
    help: "What to pull off the shelf",
    icon: CalendarClock,
    permission: "inventory.view",
  },
];

/** The four things the counter does all day, as large touch-friendly tiles. */
export function QuickActions({ role }: { role: Role }) {
  const actions = ACTIONS.filter((a) => can(role, a.permission));

  return (
    <nav
      aria-label="What do you want to do?"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {actions.map(({ href, label, help, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-h-28 items-center gap-4 rounded-xl border bg-card p-5 shadow-xs transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-7" aria-hidden />
          </span>
          <span>
            <span className="block text-lg font-semibold">{label}</span>
            <span className="block text-sm text-muted-foreground">{help}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
