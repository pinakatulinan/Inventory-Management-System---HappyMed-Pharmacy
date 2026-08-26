import "server-only";

import { z } from "zod";

/**
 * Fail fast on misconfiguration. A pharmacy system booting with a missing
 * DATABASE_URL should refuse to start, not serve half-broken pages.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** How long a login stays valid before re-authentication is required. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
  /** Shared secret for the daily expiry-digest cron endpoint. */
  CRON_SECRET: z.string().min(16).optional(),
  APP_URL: z.string().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
