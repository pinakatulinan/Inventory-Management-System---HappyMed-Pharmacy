/**
 * Create an Owner account from the command line.
 *
 * The password is read from the environment, not argv, so it does not land in
 * shell history or the process list.
 *
 *   OWNER_PASSWORD='...' npx tsx --conditions=react-server --env-file=.env \
 *     scripts/create-owner.ts "Full Name" email@example.com
 */
import "dotenv/config";

import { recordAudit } from "@/lib/audit";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

async function main() {
  const [name, rawEmail] = process.argv.slice(2);
  const password = process.env.OWNER_PASSWORD ?? "";

  if (!name || !rawEmail) {
    throw new Error('Usage: create-owner.ts "Full Name" email@example.com');
  }
  const problem = validatePasswordStrength(password);
  if (problem) throw new Error(problem);

  const email = rawEmail.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) throw new Error(`${email} is already registered.`);

  const created = await prisma.user.create({
    data: {
      name,
      email,
      role: "OWNER",
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
    },
    select: { id: true, name: true, email: true, role: true },
  });

  await recordAudit({
    userId: created.id,
    action: "user.create",
    entity: "User",
    entityId: created.id,
    summary: `Created Owner account for ${created.name} (command line)`,
    metadata: { email, role: created.role },
  });

  console.log(`Created ${created.role} account: ${created.name} <${created.email}>`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
