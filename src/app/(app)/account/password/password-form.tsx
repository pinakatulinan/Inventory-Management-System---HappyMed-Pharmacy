"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { changePasswordAction } from "@/app/(app)/account/password/actions";
import { Field, FormError, SubmitButton } from "@/components/form/form-parts";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";

export function PasswordForm() {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    changePasswordAction,
    { ok: true },
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      // Never leave a password sitting in the DOM after a successful change.
      formRef.current?.reset();
    }
  }, [state]);

  const err = (name: string) => (state.ok ? undefined : state.fieldErrors?.[name]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-5 rounded-xl border bg-card p-6 shadow-xs"
    >
      <Field
        name="currentPassword"
        label="Current password"
        required
        error={err("currentPassword")}
      >
        {(props) => (
          <Input {...props} type="password" autoComplete="current-password" required />
        )}
      </Field>

      <Field
        name="newPassword"
        label="New password"
        required
        error={err("newPassword")}
        hint="At least 10 characters. A memorable passphrase beats a short complex one."
      >
        {(props) => (
          <Input {...props} type="password" autoComplete="new-password" required />
        )}
      </Field>

      <Field
        name="confirmPassword"
        label="Confirm new password"
        required
        error={err("confirmPassword")}
      >
        {(props) => (
          <Input {...props} type="password" autoComplete="new-password" required />
        )}
      </Field>

      {!state.ok ? <FormError message={state.error} /> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Changing...">Change password</SubmitButton>
      </div>
    </form>
  );
}
