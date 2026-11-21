import { fromBase64Url, sha256Hex, toBase64Url } from "./crypto";

/**
 * Workers offers PBKDF2 natively but neither Argon2 nor scrypt, and the Free plan
 * allows 10 ms of CPU per request. The iteration count is therefore modest and is
 * backed by a secret pepper held outside the database: a leaked database alone
 * cannot be brute-forced. The count is stored per hash so it can be raised later.
 */
export const PBKDF2_ITERATIONS = 25_000;
const MAX_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const encoder = new TextEncoder();

async function pepperedKey(password: string, pepper: string) {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const peppered = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(password));
  return crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
}

async function derive(
  password: string,
  pepper: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await pepperedKey(password, pepper);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, pepper, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
  pepper: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  const [scheme, iterationText, saltText, hashText] = stored.split("$");
  const iterations = Number(iterationText);
  if (
    scheme !== "pbkdf2-sha256" ||
    !saltText ||
    !hashText ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > MAX_ITERATIONS
  ) {
    return { valid: false, needsRehash: false };
  }

  const expected = fromBase64Url(hashText);
  const actual = await derive(password, pepper, fromBase64Url(saltText), iterations);
  return {
    valid: constantTimeEqual(actual, expected),
    needsRehash: iterations !== PBKDF2_ITERATIONS,
  };
}

/** Spends the same work as a real check, so unknown usernames are not detectable by timing. */
export async function burnPasswordCheck(password: string, pepper: string): Promise<void> {
  const salt = encoder.encode(await sha256Hex(pepper)).slice(0, SALT_BYTES);
  await derive(password, pepper, salt, PBKDF2_ITERATIONS);
}
