"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/actions";

/** What the user had typed, keyed by field name. */
export type SubmittedValues = Record<string, string>;

/**
 * Everything the form posted, minus file uploads, which cannot be replayed as
 * a defaultValue and would serialise as "[object File]" if we tried.
 */
function collectValues(formData: FormData): SubmittedValues {
  const values: SubmittedValues = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/**
 * Run a Server Action and react to its result.
 *
 * The obvious approach - watch the returned state in a useEffect and toast or
 * close the dialog from there - causes a cascading render on every submission
 * and is flagged by React's lint rules. Handling the result inside the action
 * itself is both simpler and correct: the side effect belongs to the event that
 * caused it, not to observing state afterwards.
 *
 * The third element is what the user had typed. React 19 resets an uncontrolled
 * form once its action resolves, which is right after a successful save and
 * badly wrong after a validation error - the pharmacist loses a screen of
 * careful typing because one field was blank. Feeding these values back through
 * `FormValues` restores them. It is cleared on success so the next use of the
 * form starts empty.
 */
export function useAction<T = undefined>(
  action: (
    prev: ActionResult<T>,
    formData: FormData,
  ) => Promise<ActionResult<T>>,
  options: {
    onSuccess?: (data: T | undefined) => void;
    onError?: (error: string) => void;
    /** Set false to handle the success message yourself. */
    toastOnSuccess?: boolean;
  } = {},
) {
  const { onSuccess, onError, toastOnSuccess = true } = options;
  const [submitted, setSubmitted] = useState<SubmittedValues | undefined>();

  const [state, formAction] = useActionState<ActionResult<T>, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);

      if (result.ok) {
        setSubmitted(undefined);
        if (toastOnSuccess && result.message) toast.success(result.message);
        onSuccess?.(result.data);
      } else {
        setSubmitted(collectValues(formData));
        onError?.(result.error);
      }

      return result;
    },
    { ok: true },
  );

  return [state, formAction, submitted] as const;
}

/** Read a field error out of an action result, if there is one. */
export function fieldError(
  state: ActionResult<unknown>,
  name: string,
): string | undefined {
  return state.ok ? undefined : state.fieldErrors?.[name];
}
