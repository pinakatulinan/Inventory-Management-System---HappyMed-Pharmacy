"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CalendarClock,
  ChartColumn,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  PackagePlus,
  Pill,
  ScrollText,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { isActive, type NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** String keys keep the nav config serialisable across the server boundary. */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  CalendarClock,
  Boxes,
  HandCoins,
  PackagePlus,
  Pill,
  Truck,
  ClipboardList,
  ChartColumn,
  Users,
  Settings,
  ScrollText,
};

export function SidebarNav({
  sections,
  expiringCount = 0,
  onNavigate,
}: {
  sections: NavSection[];
  /** Badge on "Expiry alerts" - the number needing attention right now. */
  expiringCount?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-4" aria-label="Main">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {section.title}
          </p>

          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Boxes;
              const active = isActive(pathname, item);
              const showBadge = item.href === "/expiry" && expiringCount > 0;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4.5 shrink-0",
                        active
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-primary",
                      )}
                      aria-hidden
                    />
                    <span className="flex-1">{item.label}</span>

                    {showBadge ? (
                      <span
                        className="rounded-full bg-status-critical px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular"
                        aria-label={`${expiringCount} batches need attention`}
                      >
                        {expiringCount > 99 ? "99+" : expiringCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
