import type { Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/lib/auth/rbac";

/**
 * Navigation is derived from the same permission matrix that guards the server
 * actions, so a staff member never sees a link to a page that would reject them.
 *
 * `icon` is a string rather than a component because navigation is built on the
 * server and rendered by a client component, and functions cannot cross that
 * boundary.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
  /** Match nested routes too, e.g. /products/abc highlights "Products". */
  matchPrefix?: boolean;
  /** Hidden from these roles even if the permission allows it, to keep their menu short. */
  hideFor?: Role[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: "Operations",
    items: [
      {
        href: "/dashboard",
        label: "Home",
        icon: "LayoutDashboard",
        permission: "inventory.view",
      },
      {
        href: "/expiry",
        label: "Expiring soon",
        icon: "CalendarClock",
        permission: "inventory.view",
        matchPrefix: true,
      },
      {
        href: "/inventory",
        label: "Check stock",
        icon: "Boxes",
        permission: "inventory.view",
        matchPrefix: true,
      },
      {
        href: "/dispense",
        label: "Dispense",
        icon: "HandCoins",
        permission: "stock.dispense",
        matchPrefix: true,
      },
      {
        href: "/receive",
        label: "Receive stock",
        icon: "PackagePlus",
        permission: "stock.receive",
        matchPrefix: true,
      },
    ],
  },
  {
    title: "Catalogue",
    items: [
      {
        href: "/products",
        label: "Items",
        icon: "Pill",
        permission: "inventory.view",
        matchPrefix: true,
        hideFor: ["STAFF"],
      },
      {
        href: "/suppliers",
        label: "Suppliers",
        icon: "Truck",
        permission: "supplier.manage",
        matchPrefix: true,
      },
      {
        href: "/purchase-orders",
        label: "Purchase orders",
        icon: "ClipboardList",
        permission: "po.view",
        matchPrefix: true,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        href: "/reports",
        label: "Reports",
        icon: "ChartColumn",
        permission: "reports.view",
        matchPrefix: true,
      },
      {
        href: "/staff",
        label: "Staff",
        icon: "Users",
        permission: "user.manage",
        matchPrefix: true,
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "Settings",
        permission: "settings.manage",
        matchPrefix: true,
      },
      {
        href: "/audit",
        label: "Audit log",
        icon: "ScrollText",
        permission: "audit.view",
        matchPrefix: true,
      },
    ],
  },
];

/** Sections the given role may see, with empty sections dropped. */
export function navigationFor(role: Role): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => can(role, item.permission) && !item.hideFor?.includes(role),
    ),
  })).filter((section) => section.items.length > 0);
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  return Boolean(item.matchPrefix) && pathname.startsWith(`${item.href}/`);
}
