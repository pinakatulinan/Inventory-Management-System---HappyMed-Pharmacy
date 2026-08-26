import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Migrations connect differently from the running application.
 *
 * The app uses the transaction pooler (port 6543), which multiplexes many
 * short-lived serverless connections onto few real ones. That mode cannot carry
 * DDL or the session-level advisory locks Prisma holds while migrating, so
 * `prisma migrate` must use a direct or session-pooled connection (port 5432)
 * instead. Pointing migrations at the transaction pooler produces migrations
 * that hang or half-apply.
 */
const migrationUrl =
  process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"];

if (!process.env["DIRECT_DATABASE_URL"] && process.env["DATABASE_URL"]) {
  console.warn(
    "[prisma] DIRECT_DATABASE_URL is not set - falling back to DATABASE_URL.\n" +
      "         If that is a transaction pooler (port 6543), migrations may hang.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Runs after `prisma migrate reset` and on a freshly created database.
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
    // Scratch database for diffing, so migrations never run speculative DDL
    // against real data. When unset, Prisma creates and drops a temporary
    // database on the target server instead.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] || undefined,
  },
});
