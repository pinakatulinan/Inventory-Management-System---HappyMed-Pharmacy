import "server-only";

import { compare, hash } from "bcryptjs";

/**
 * 12 rounds is the current sensible floor: roughly a quarter-second per hash on
 * commodity hardware, which is tolerable for a login form and expensive enough
 * to make offline cracking of a leaked table impractical.
 */
const BCRYPT_ROUNDS = 12;

/**
 * A pre-computed hash of a value nobody can log in with. Comparing against it
 * when the email is unknown makes a failed lookup cost the same as a wrong
 * password, so response timing cannot be used to enumerate staff accounts.
 */
const DUMMY_HASH = "$2b$12$VpuEEPtMkccnG5hiK32/l.k3GFWWIWrEVofDgTYEZwrBi4fzJ18qy";

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, BCRYPT_ROUNDS);
}

export function verifyPassword(
  plaintext: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(plaintext, passwordHash);
}

/** Burn the same time as a real verification when no user matched. */
export async function fakeVerify(plaintext: string): Promise<void> {
  await compare(plaintext, DUMMY_HASH);
}

/**
 * Deliberately permissive on composition, strict on length. Staff share a
 * terminal behind the counter; long passphrases they will actually remember
 * beat character-class rules they will write on a sticky note.
 */
export function validatePasswordStrength(plaintext: string): string | null {
  if (plaintext.length < 10) {
    return "Password must be at least 10 characters long.";
  }
  if (plaintext.length > 200) {
    return "Password must be at most 200 characters long.";
  }
  if (/^\s|\s$/.test(plaintext)) {
    return "Password cannot start or end with a space.";
  }
  return null;
}
