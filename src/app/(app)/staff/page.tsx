import type { Metadata } from "next";

import { CreateUserDialog, StaffRowActions } from "@/app/(app)/staff/staff-client";
import {
  DataTable,
  TableBody,
  TableCard,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/data-table/table";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { formatInstant, formatRelative } from "@/lib/dates";
import { listStaff } from "@/lib/queries/staff";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const actor = await requirePermission("user.manage");
  const settings = await getSettings();

  const users = await listStaff();

  const activeOwners = users.filter(
    (u) => u.role === "OWNER" && u.isActive,
  ).length;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Accounts and permissions for the people who use this system."
        actions={<CreateUserDialog />}
      />

      {activeOwners === 1 ? (
        <div className="mb-4 rounded-lg border border-status-warning-border bg-status-warning-soft px-4 py-3 text-sm text-status-warning">
          There is only one active Owner account. If it is locked out, nobody can
          manage staff or settings. Consider promoting a second person to Owner.
        </div>
      ) : null}

      <TableCard>
        <DataTable caption="Staff accounts and their roles">
          <TableHead>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Last sign-in</Th>
            <Th align="right">Sessions</Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </TableHead>

          <TableBody>
            {users.map((user) => {
              return (
                <Tr key={user.id} className={cn(!user.isActive && "opacity-60")}>
                  <Td>
                    <p className="font-medium">
                      {user.name}
                      {user.id === actor.id ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                          you
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </Td>

                  <Td>{ROLE_LABELS[user.role]}</Td>

                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          user.isActive
                            ? "border-status-ok-border bg-status-ok-soft text-status-ok"
                            : "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {user.isActive ? "Active" : "Deactivated"}
                      </span>

                      {user.isLocked ? (
                        <span className="inline-flex rounded-full border border-status-expired-border bg-status-expired-soft px-2 py-0.5 text-xs font-medium text-status-expired">
                          Locked
                        </span>
                      ) : null}

                      {user.mustChangePassword ? (
                        <span className="inline-flex rounded-full border border-status-warning-border bg-status-warning-soft px-2 py-0.5 text-xs font-medium text-status-warning">
                          Must set password
                        </span>
                      ) : null}
                    </div>
                  </Td>

                  <Td>
                    {user.lastLoginAt ? (
                      <span title={formatInstant(user.lastLoginAt, settings.timeZone, settings.locale)}>
                        {formatRelative(user.lastLoginAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </Td>

                  <Td align="right" className="tabular">
                    {user.sessionCount}
                  </Td>

                  <Td align="right">
                    <StaffRowActions
                      userId={user.id}
                      userName={user.name}
                      role={user.role}
                      isActive={user.isActive}
                      isSelf={user.id === actor.id}
                    />
                  </Td>
                </Tr>
              );
            })}
          </TableBody>
        </DataTable>
      </TableCard>
    </>
  );
}
