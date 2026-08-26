import "dotenv/config";

import { prisma } from "@/lib/db";

/**
 * Guard against re-opening the Supabase REST surface.
 *
 * The lock_down_public_schema migration closes it once, but a table added by a
 * later migration arrives with RLS off. This check fails the build in that case,
 * so the hole cannot reappear silently months from now.
 *
 * Run against the same database the app uses:  npm run db:check-rls
 */

async function main() {
  const unprotected = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT c.relname AS "tablename"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity = false
     ORDER BY c.relname
  `;

  const exposed = await prisma.$queryRaw<
    { grantee: string; tablename: string; privilege_type: string }[]
  >`
    SELECT grantee, table_name AS "tablename", privilege_type
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
     ORDER BY grantee, table_name, privilege_type
  `;

  let failed = false;

  if (unprotected.length > 0) {
    failed = true;
    console.error(
      `\nFAIL: ${unprotected.length} table(s) in "public" have Row Level Security disabled:`,
    );
    for (const row of unprotected) console.error(`  - ${row.tablename}`);
    console.error(
      "\nFix with:  ALTER TABLE public.\"TableName\" ENABLE ROW LEVEL SECURITY;",
    );
  }

  if (exposed.length > 0) {
    failed = true;
    const byRole = new Map<string, Set<string>>();
    for (const row of exposed) {
      if (!byRole.has(row.grantee)) byRole.set(row.grantee, new Set());
      byRole.get(row.grantee)!.add(row.tablename);
    }

    console.error("\nFAIL: Supabase API roles still hold grants in \"public\":");
    for (const [role, tables] of byRole) {
      console.error(`  - ${role}: ${[...tables].join(", ")}`);
    }
    console.error(
      "\nFix with:  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;",
    );
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  const tableCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  `;

  console.log(
    `OK: all ${tableCount[0]?.count ?? 0} tables in "public" have RLS enabled, ` +
      "and no anon/authenticated grants remain.",
  );
}

main()
  .catch((error) => {
    console.error("RLS check failed to run:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
