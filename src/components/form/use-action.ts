"use client";

import { useActionState } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/actions";

/**
 * Run a Server Action and react to its result.
 *
 * The obvious approach - watch the returned state in a useEffect and toast or
 * close the dialog from there - causes a cascading render on every submission
 * and is flagged by React's lint rules. Handling the result inside the action
 * itself is both simpler and correct: the side effect belongs to the event that
 * caused it, not to observing state afterwards.
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

  return useActionState<ActionResult<T>, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);

      if (result.ok) {
        if (toastOnSuccess && result.message) toast.success(result.message);
        onSuccess?.(result.data);
      } else {
        onError?.(result.error);
      }

      return result;
    },
    { ok: true },
  );
}

/** Read a field error out of an action result, if there is one. */
export function fieldError(
  state: ActionResult<unknown>,
  name: string,
): string | undefined {
  return state.ok ? undefined : state.fieldErrors?.[name];
}
