import type { Role } from "@/generated/prisma/enums";

/**
 * The single source of truth for who may do what.
 *
 * This module is intentionally free of imports from the database or Next.js so
 * it can be used in Server Actions, Server Components and client components
 * alike. Client-side checks only hide UI; every mutation re-checks server-side.
 */

export const PERMISSIONS = {
  // Read
  "inventory.view": ["OWNER", "PHARMACIST", "STAFF"],
  "reports.view": ["OWNER", "PHARMACIST"],
  "audit.view": ["OWNER"],

  // Stock movements
  "stock.dispense": ["OWNER", "PHARMACIST", "STAFF"],
  "stock.receive": ["OWNER", "PHARMACIST"],
  "stock.adjust": ["OWNER", "PHARMACIST"],
  "stock.dispose": ["OWNER", "PHARMACIST"],

  // Catalogue
  "catalogue.manage": ["OWNER", "PHARMACIST"],
  "supplier.manage": ["OWNER", "PHARMACIST"],

  // Procurement
  "po.view": ["OWNER", "PHARMACIST"],
  "po.manage": ["OWNER", "PHARMACIST"],

  // Administration
  "user.manage": ["OWNER"],
  "settings.manage": ["OWNER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** True only if the role holds every listed permission. */
export function canAll(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

/** True if the role holds at least one of the listed permissions. */
export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  PHARMACIST: "Pharmacist",
  STAFF: "Staff",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER:
    "Full access, including staff accounts, settings and the audit trail.",
  PHARMACIST:
    "Runs day-to-day inventory: receiving, adjustments, disposals, catalogue and purchase orders.",
  STAFF:
    "Views stock and records dispensing. Cannot change the catalogue or adjust quantities.",
};

/** Thrown by the server-side guards; surfaces as a 403 page or an action error. */
export class AuthorizationError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}
