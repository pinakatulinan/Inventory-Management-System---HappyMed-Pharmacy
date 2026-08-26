"use client";

import { useState } from "react";
import { KeyRound, MoreHorizontal, ShieldCheck, UserPlus, UserX } from "lucide-react";

import {
  createUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserRoleAction,
} from "@/app/(app)/staff/actions";
import { Field, FormError, SubmitButton } from "@/components/form/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/generated/prisma/enums";
import { useAction } from "@/components/form/use-action";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/rbac";

const ROLES: Role[] = ["OWNER", "PHARMACIST", "STAFF"];

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useAction(createUserAction, {
    onSuccess: () => setOpen(false),
  });


  const fieldError = (name: string) =>
    state.ok ? undefined : state.fieldErrors?.[name];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden />
          Add staff
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Add a staff account</DialogTitle>
            <DialogDescription>
              They will sign in with the password you set here, then be asked to
              choose their own.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field name="name" label="Full name" required error={fieldError("name")}>
              {(props) => <Input {...props} autoComplete="off" required />}
            </Field>

            <Field name="email" label="Email address" required error={fieldError("email")}>
              {(props) => (
                <Input {...props} type="email" autoComplete="off" required />
              )}
            </Field>

            <Field
              name="role"
              label="Role"
              required
              error={fieldError("role")}
              hint={ROLE_DESCRIPTIONS.STAFF}
            >
              {(props) => (
                <Select name={props.name} defaultValue="STAFF">
                  <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              name="password"
              label="Temporary password"
              required
              error={fieldError("password")}
              hint="At least 10 characters. They will change it at first sign-in."
            >
              {(props) => (
                <Input {...props} type="text" autoComplete="new-password" required />
              )}
            </Field>

            {!state.ok ? <FormError message={state.error} /> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton pendingLabel="Creating...">Create account</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useAction(resetUserPasswordAction, {
    onSuccess: () => onOpenChange(false),
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />

          <DialogHeader>
            <DialogTitle>Reset password for {userName}</DialogTitle>
            <DialogDescription>
              This signs them out everywhere immediately, and they must choose a
              new password at their next sign-in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field
              name="password"
              label="New temporary password"
              required
              error={state.ok ? undefined : state.fieldErrors?.password}
              hint="At least 10 characters."
            >
              {(props) => (
                <Input {...props} type="text" autoComplete="new-password" required />
              )}
            </Field>

            {!state.ok ? <FormError message={state.error} /> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Resetting...">Reset password</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleDialog({
  userId,
  userName,
  currentRole,
  open,
  onOpenChange,
}: {
  userId: string;
  userName: string;
  currentRole: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useAction(updateUserRoleAction, {
    onSuccess: () => onOpenChange(false),
  });
  const [role, setRole] = useState<Role>(currentRole);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="role" value={role} />

          <DialogHeader>
            <DialogTitle>Change role for {userName}</DialogTitle>
            <DialogDescription>
              They will be signed out and must sign in again for the new
              permissions to take effect.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>

            {!state.ok ? <FormError message={state.error} /> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving..." disabled={role === currentRole}>
              Change role
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleActiveDialog({
  userId,
  userName,
  isActive,
  open,
  onOpenChange,
}: {
  userId: string;
  userName: string;
  isActive: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useAction(setUserActiveAction, {
    onSuccess: () => onOpenChange(false),
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="isActive" value={String(!isActive)} />

          <DialogHeader>
            <DialogTitle>
              {isActive ? `Deactivate ${userName}?` : `Reactivate ${userName}?`}
            </DialogTitle>
            <DialogDescription>
              {isActive
                ? "They will be signed out of every device immediately and will not be able to sign in. Their history stays intact."
                : "They will be able to sign in again with their existing password."}
            </DialogDescription>
          </DialogHeader>

          {!state.ok ? (
            <div className="py-4">
              <FormError message={state.error} />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton
              pendingLabel={isActive ? "Deactivating..." : "Reactivating..."}
              variant={isActive ? "destructive" : "default"}
            >
              {isActive ? "Deactivate" : "Reactivate"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StaffRowActions({
  userId,
  userName,
  role,
  isActive,
  isSelf,
}: {
  userId: string;
  userName: string;
  role: Role;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [dialog, setDialog] = useState<"role" | "password" | "active" | null>(
    null,
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal aria-hidden />
            <span className="sr-only">Actions for {userName}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setDialog("role")} disabled={isSelf}>
            <ShieldCheck aria-hidden />
            Change role
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setDialog("password")}>
            <KeyRound aria-hidden />
            Reset password
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => setDialog("active")}
            disabled={isSelf}
            variant={isActive ? "destructive" : "default"}
          >
            <UserX aria-hidden />
            {isActive ? "Deactivate" : "Reactivate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted conditionally so each dialog starts with fresh action state. */}
      {dialog === "role" ? (
        <ChangeRoleDialog
          userId={userId}
          userName={userName}
          currentRole={role}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      ) : null}

      {dialog === "password" ? (
        <ResetPasswordDialog
          userId={userId}
          userName={userName}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      ) : null}

      {dialog === "active" ? (
        <ToggleActiveDialog
          userId={userId}
          userName={userName}
          isActive={isActive}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      ) : null}
    </>
  );
}
