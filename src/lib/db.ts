import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * Prisma 7 talks to Postgres through a driver adapter rather than a bundled
 * Rust engine, so the connection pool lives here.
 *
 * DATABASE_URL must point at Supabase's transaction pooler (port 6543), not at
 * the database directly. Each serverless instance keeps its own pool, and there
 * can be many instances at once; pointed straight at Postgres they would
 * exhaust its connection limit under very ordinary load. Migrations are the
 * exception and use DIRECT_DATABASE_URL - see prisma7.config.ts.
 *
 * The client is cached on globalThis because Next.js hot-reload re-evaluates
 * modules on every edit; without this, dev would leak a connection pool per
 * save and exhaust the database in minutes.
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      // The pooler already multiplexes across instances, so each instance needs
      // only a handful of connections. A large local pool here just moves the
      // exhaustion problem one layer up.
      max: 5,
      // Fail fast rather than piling up requests behind a stalled connection -
      // a hung checkout on a dispense screen is worse than a clear error.
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
