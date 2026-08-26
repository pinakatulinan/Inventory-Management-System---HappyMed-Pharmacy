import "server-only";

import { z } from "zod";

import { AuthorizationError } from "@/lib/auth/rbac";
import {
  BatchNotDispensableError,
  InsufficientStockError,
} from "@/lib/stock";

/**
 * One shape for every Server Action result, so forms can render errors the same
 * way everywhere and never have to guess what came back.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function actionOk<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function actionError(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Flatten a Zod error into { fieldName: firstMessage }. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/**
 * Turn a thrown error into a message safe to show a pharmacist.
 *
 * Domain errors carry text written for the person at the counter and are passed
 * through verbatim. Anything else is logged server-side and replaced with a
 * generic line, because raw database errors leak schema details and help nobody
 * behind the till.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof AuthorizationError) {
    return actionError(
      "You do not have permission to do this. Ask the pharmacy owner.",
    );
  }

  if (
    error instanceof InsufficientStockError ||
    error instanceof BatchNotDispensableError
  ) {
    return actionError(error.message);
  }

  if (error instanceof z.ZodError) {
    return actionError("Please check the highlighted fields.", fieldErrorsFrom(error));
  }

  // Unique-constraint violations are common and explainable; surface them.
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  ) {
    const target = (error as { meta?: { target?: string[] } }).meta?.target;
    const field = Array.isArray(target) ? target.join(", ") : "value";
    return actionError(`That ${field} is already in use.`);
  }

  if (error instanceof Error && error.name === "PrismaClientKnownRequestError") {
    console.error("[action] prisma error:", error);
    return actionError("The database rejected that change. Please try again.");
  }

  // Errors we raised deliberately in the domain layer read fine as-is.
  if (error instanceof Error && !error.stack?.includes("node_modules")) {
    return actionError(error.message);
  }

  console.error("[action] unexpected error:", error);
  return actionError("Something went wrong. Please try again.");
}

/** Read a trimmed string from FormData, or undefined when blank. */
export function formString(data: FormData, key: string): string | undefined {
  const value = data.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Read a checkbox: present means checked. */
export function formBoolean(data: FormData, key: string): boolean {
  return data.get(key) === "on" || data.get(key) === "true";
}

/** Read an integer, returning NaN when absent so Zod can report it. */
export function formInt(data: FormData, key: string): number {
  const raw = formString(data, key);
  if (raw === undefined) return Number.NaN;
  return Number.parseInt(raw, 10);
}
