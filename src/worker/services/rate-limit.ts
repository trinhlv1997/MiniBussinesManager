import { inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { authRateLimits } from "../../db/schema";
import { ApiError } from "../lib/errors";
import { sha256Hex } from "../lib/crypto";

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export type RateLimitRule = { key: string; limit: number };

const hashedKey = (key: string) => sha256Hex(`rate-limit:${key}`);

/**
 * Counts the attempt first and checks afterwards, so parallel requests cannot all
 * slip through before any of them is recorded. Runs before the costly password hash.
 */
export async function consumeAttempt(db: Db, rules: RateLimitRule[]): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS).toISOString();
  const hashedRules = await Promise.all(
    rules.map(async (rule) => ({ ...rule, key: await hashedKey(rule.key) })),
  );

  const statements = hashedRules.map((rule) =>
    db
      .insert(authRateLimits)
      .values({ key: rule.key, attempts: 1, windowStartedAt: nowIso })
      .onConflictDoUpdate({
        target: authRateLimits.key,
        set: {
          attempts: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${windowStart} THEN 1 ELSE ${authRateLimits.attempts} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${windowStart} THEN ${nowIso} ELSE ${authRateLimits.windowStartedAt} END`,
        },
      })
      .returning(),
  );
  const [first, ...rest] = statements;
  if (!first) return;
  const results = await db.batch([first, ...rest]);

  let retryAfterSeconds = 0;
  results.forEach((rows, index) => {
    const row = rows[0];
    const rule = hashedRules[index];
    if (!row || !rule || row.attempts <= rule.limit) return;
    const resetAt = new Date(row.windowStartedAt).getTime() + RATE_LIMIT_WINDOW_MS;
    retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((resetAt - now.getTime()) / 1000));
  });

  if (retryAfterSeconds > 0) {
    throw new ApiError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
      undefined,
      retryAfterSeconds,
    );
  }
}

export const hashAttemptKeys = (keys: string[]) => Promise.all(keys.map(hashedKey));

// Returns the unexecuted query for db.batch(); awaiting a Drizzle query would run it.
export function clearAttemptsQuery(db: Db, hashedKeys: string[]) {
  return db.delete(authRateLimits).where(inArray(authRateLimits.key, hashedKeys));
}

export function deleteExpiredAttemptsQuery(db: Db) {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  return db.delete(authRateLimits).where(lt(authRateLimits.windowStartedAt, cutoff));
}
