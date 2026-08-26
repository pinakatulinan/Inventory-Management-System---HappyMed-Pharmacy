"use client";

import { createContext, useContext } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import type { SubmittedValues } from "@/components/form/use-action";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SubmittedValuesContext = createContext<SubmittedValues | undefined>(
  undefined,
);

/**
 * Wrap a form in this and every Field inside will restore what the user typed
 * after a failed submit, instead of reverting to the stored value. Pass the
 * third element returned by `useAction`.
 */
export function FormValues({
  values,
  children,
}: {
  values: SubmittedValues | undefined;
  children: React.ReactNode;
}) {
  return (
    <SubmittedValuesContext.Provider value={values}>
      {children}
    </SubmittedValuesContext.Provider>
  );
}

/**
 * Whether a submit has come back rejected. Checkboxes need this: an unticked
 * box sends nothing at all, so its absence from the submitted values only means
 * "unticked" if there was a submission to be absent from.
 */
export function useWasRejected(): boolean {
  return useContext(SubmittedValuesContext) !== undefined;
}

export function useSubmittedValue(name: string): string | undefined {
  return useContext(SubmittedValuesContext)?.[name];
}

/**
 * Shared form furniture. Every create/edit screen in the app is built from
 * these, so validation errors, pending states and required-field marks look and
 * behave identically wherever they appear.
 */

export function SubmitButton({
  children,
  pendingLabel = "Saving...",
  className,
  variant,
  size,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={className}
      variant={variant}
      size={size}
      disabled={pending || disabled}
    >
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-status-expired-border bg-status-expired-soft px-3 py-2.5 text-sm text-status-expired"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/**
 * Label + control + error, wired for accessibility: the error is linked with
 * aria-describedby and the control is marked aria-invalid, so screen readers
 * announce the problem rather than leaving a silent red border.
 */
export function Field({
  name,
  label,
  hint,
  error,
  required,
  className,
  defaultValue,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** The stored value. A rejected submission's value wins over it. */
  defaultValue?: string;
  children: (props: {
    id: string;
    name: string;
    defaultValue: string | undefined;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const submitted = useSubmittedValue(name);
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-status-expired" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </Label>

      {children({
        id,
        name,
        defaultValue: submitted ?? defaultValue,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-xs font-medium text-status-expired">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Section divider inside long forms. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
