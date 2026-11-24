import { and, eq, gt, lte } from "drizzle-orm";
import type { AdminProfile } from "@shared/api";
import type { ChangePasswordInput, LoginInput } from "@shared/validation/auth";
import type { Db } from "../../db/client";
import { adminSessions, adminUsers, auditLogs } from "../../db/schema";
import { randomToken, sha256Hex } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../lib/password";
import {
  clearAttemptsQuery,
  consumeAttempt,
  deleteExpiredAttemptsQuery,
  hashAttemptKeys,
} from "./rate-limit";

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_LIMIT_PER_IP = 5;
const LOGIN_LIMIT_PER_ACCOUNT = 20;
const PASSWORD_CHANGE_LIMIT = 5;

const profileColumns = {
  id: adminUsers.id,
  username: adminUsers.username,
  displayName: adminUsers.displayName,
  role: adminUsers.role,
  employeeId: adminUsers.employeeId,
};

function newSession(userId: number) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  return { token, expiresAt, userId };
}

export async function login(
  db: Db,
  pepper: string,
  input: LoginInput,
  clientIp: string,
): Promise<{ token: string; admin: AdminProfile }> {
  const ipKey = `login-ip:${clientIp}`;
  const accountKey = `login-account:${input.username}`;
  await consumeAttempt(db, [
    { key: ipKey, limit: LOGIN_LIMIT_PER_IP },
    { key: accountKey, limit: LOGIN_LIMIT_PER_ACCOUNT },
  ]);

  const user = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.username, input.username),
  });

  const result = user
    ? await verifyPassword(input.password, user.passwordHash, pepper)
    : await burnPasswordCheck(input.password, pepper).then(() => ({
        valid: false,
        needsRehash: false,
      }));

  if (!user || !result.valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng");
  }
  // Chỉ báo "đã khoá" sau khi mật khẩu đúng, để không lộ tài khoản nào tồn tại.
  if (!user.active) {
    throw new ApiError(403, "ACCOUNT_DISABLED", "Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên.");
  }

  const session = newSession(user.id);
  const nowIso = new Date().toISOString();
  const sessionId = await sha256Hex(session.token);
  const attemptKeys = await hashAttemptKeys([ipKey, accountKey]);
  await db.batch([
    db.delete(adminSessions).where(lte(adminSessions.expiresAt, nowIso)),
    deleteExpiredAttemptsQuery(db),
    clearAttemptsQuery(db, attemptKeys),
    db.insert(adminSessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt: session.expiresAt,
    }),
    db.update(adminUsers).set({ lastLoginAt: nowIso }).where(eq(adminUsers.id, user.id)),
    db.insert(auditLogs).values({
      actorId: user.id,
      action: "auth.login",
      entityType: "admin_user",
      entityId: String(user.id),
    }),
  ]);

  return {
    token: session.token,
    admin: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      employeeId: user.employeeId,
    },
  };
}

export async function findSession(
  db: Db,
  token: string,
): Promise<{ sessionId: string; admin: AdminProfile } | null> {
  const sessionId = await sha256Hex(token);
  const [row] = await db
    .select(profileColumns)
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(
      and(
        eq(adminSessions.id, sessionId),
        gt(adminSessions.expiresAt, new Date().toISOString()),
        // Khoá tài khoản có hiệu lực ngay, kể cả với phiên đang mở.
        eq(adminUsers.active, true),
      ),
    )
    .limit(1);
  return row ? { sessionId, admin: row } : null;
}

export async function logout(db: Db, sessionId: string, adminId: number): Promise<void> {
  await db.batch([
    db.delete(adminSessions).where(eq(adminSessions.id, sessionId)),
    db.insert(auditLogs).values({
      actorId: adminId,
      action: "auth.logout",
      entityType: "admin_user",
      entityId: String(adminId),
    }),
  ]);
}

/** Revokes every existing session and returns a fresh token for the current device. */
export async function changePassword(
  db: Db,
  pepper: string,
  adminId: number,
  input: ChangePasswordInput,
): Promise<{ token: string }> {
  const attemptKey = `password-change:${adminId}`;
  await consumeAttempt(db, [{ key: attemptKey, limit: PASSWORD_CHANGE_LIMIT }]);

  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, adminId) });
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập");

  const { valid } = await verifyPassword(input.currentPassword, user.passwordHash, pepper);
  if (!valid) {
    throw new ApiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", {
      currentPassword: "Mật khẩu hiện tại không đúng",
    });
  }

  const passwordHash = await hashPassword(input.newPassword, pepper);
  const session = newSession(adminId);
  const sessionId = await sha256Hex(session.token);
  const attemptKeys = await hashAttemptKeys([attemptKey]);
  await db.batch([
    db
      .update(adminUsers)
      .set({ passwordHash, passwordChangedAt: new Date().toISOString() })
      .where(eq(adminUsers.id, adminId)),
    db.delete(adminSessions).where(eq(adminSessions.userId, adminId)),
    clearAttemptsQuery(db, attemptKeys),
    db.insert(adminSessions).values({
      id: sessionId,
      userId: adminId,
      expiresAt: session.expiresAt,
    }),
    db.insert(auditLogs).values({
      actorId: adminId,
      action: "auth.password_changed",
      entityType: "admin_user",
      entityId: String(adminId),
    }),
  ]);

  return { token: session.token };
}
