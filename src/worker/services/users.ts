import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import type { Role } from "@shared/permissions";
import type { UserAccount, UserName } from "@shared/types";
import type { UserCreateInput, UserUpdateInput } from "@shared/validation/users";
import type { Db } from "../../db/client";
import { adminSessions, adminUsers, employees } from "../../db/schema";
import type { Actor } from "../env";
import { LAST_INSERT_ID, auditQuery, dbErrorText, notFound, runBatch } from "../lib/db";
import { ApiError } from "../lib/errors";
import { hashPassword } from "../lib/password";

/** Cột `role` cũ chỉ nhận admin / employee (xem schema.ts): Quản lý ghi là employee ở cột này. */
const legacyRoleOf = (role: Role) => (role === "admin" ? "admin" : "employee");

const invalid = (field: string, message: string) => new ApiError(422, "VALIDATION_ERROR", message, { [field]: message });

/** Tài khoản kèm nhân viên gắn và lần đăng nhập cuối. Cột của bảng nối đều có alias riêng (D1 gộp cột trùng tên). */
const accountColumns = {
  id: adminUsers.id,
  username: adminUsers.username,
  displayName: adminUsers.displayName,
  role: adminUsers.role,
  employeeId: adminUsers.employeeId,
  employeeCode: sql<string | null>`${employees.code}`.as("employee_code"),
  employeeName: sql<string | null>`${employees.fullName}`.as("employee_name"),
  active: adminUsers.active,
  lastLoginAt: adminUsers.lastLoginAt,
  createdAt: adminUsers.createdAt,
};

export async function listUsers(db: Db): Promise<UserAccount[]> {
  return db
    .select(accountColumns)
    .from(adminUsers)
    .leftJoin(employees, eq(employees.id, adminUsers.employeeId))
    .orderBy(asc(adminUsers.displayName));
}

async function findUser(db: Db, id: number): Promise<UserAccount> {
  const [row] = await db
    .select(accountColumns)
    .from(adminUsers)
    .leftJoin(employees, eq(employees.id, adminUsers.employeeId))
    .where(eq(adminUsers.id, id))
    .limit(1);
  if (!row) throw notFound("Không tìm thấy tài khoản");
  return row;
}

/** Tên hiển thị của mọi tài khoản, để giao diện ghi "Tạo bởi …". */
export async function listUserNames(db: Db): Promise<UserName[]> {
  return db
    .select({ id: adminUsers.id, displayName: adminUsers.displayName, active: adminUsers.active })
    .from(adminUsers)
    .orderBy(asc(adminUsers.displayName));
}

async function assertEmployeeFree(db: Db, employeeId: number | null, exceptUserId?: number) {
  if (employeeId === null) return;
  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), isNull(employees.deletedAt)))
    .limit(1);
  if (!employee) throw invalid("employeeId", "Nhân viên không tồn tại hoặc đã bị xóa");
  const [taken] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(and(eq(adminUsers.employeeId, employeeId), exceptUserId ? ne(adminUsers.id, exceptUserId) : undefined))
    .limit(1);
  if (taken) throw invalid("employeeId", "Nhân viên này đã có tài khoản khác");
}

export async function createUser(db: Db, pepper: string, actor: Actor, input: UserCreateInput) {
  await assertEmployeeFree(db, input.employeeId);
  const passwordHash = await hashPassword(input.password, pepper);
  try {
    const [rows] = (await runBatch(db, [
      db
        .insert(adminUsers)
        .values({
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          role: input.role,
          legacyRole: legacyRoleOf(input.role),
          employeeId: input.employeeId,
        })
        .returning({ id: adminUsers.id }),
      auditQuery(db, actor.id, "user.create", "admin_user", LAST_INSERT_ID, {
        code: input.username,
        role: input.role,
      }),
    ])) as [{ id: number }[]];
    return findUser(db, rows[0]!.id);
  } catch (error) {
    if (dbErrorText(error).includes("UNIQUE constraint failed: admin_users.username")) {
      throw invalid("username", "Tên đăng nhập đã tồn tại");
    }
    throw error;
  }
}

async function activeAdminCount(db: Db, exceptUserId: number): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(adminUsers)
    .where(and(eq(adminUsers.role, "admin"), eq(adminUsers.active, true), ne(adminUsers.id, exceptUserId)));
  return row?.total ?? 0;
}

export async function updateUser(db: Db, actor: Actor, id: number, input: UserUpdateInput) {
  const existing = await findUser(db, id);
  const losesAdmin = existing.role === "admin" && existing.active && (input.role !== "admin" || !input.active);
  if (id === actor.id && losesAdmin) {
    throw invalid(input.active ? "role" : "active", "Không thể tự hạ quyền hoặc tự khoá tài khoản của chính mình");
  }
  if (losesAdmin && (await activeAdminCount(db, id)) === 0) {
    throw invalid(input.active ? "role" : "active", "Hệ thống cần ít nhất một quản trị viên đang hoạt động");
  }
  await assertEmployeeFree(db, input.employeeId, id);

  await runBatch(db, [
    db
      .update(adminUsers)
      .set({
        displayName: input.displayName,
        role: input.role,
        legacyRole: legacyRoleOf(input.role),
        employeeId: input.employeeId,
        active: input.active,
      })
      .where(eq(adminUsers.id, id)),
    // Khoá tài khoản thì đăng xuất ngay trên mọi thiết bị.
    ...(input.active ? [] : [db.delete(adminSessions).where(eq(adminSessions.userId, id))]),
    auditQuery(db, actor.id, "user.update", "admin_user", String(id), {
      code: existing.username,
      role: input.role,
      active: input.active,
    }),
  ]);
  return findUser(db, id);
}

/** Admin đặt mật khẩu mới cho tài khoản khác (quên mật khẩu); người đó bị đăng xuất mọi nơi. */
export async function resetUserPassword(db: Db, pepper: string, actor: Actor, id: number, password: string) {
  const existing = await findUser(db, id);
  const passwordHash = await hashPassword(password, pepper);
  await runBatch(db, [
    db
      .update(adminUsers)
      .set({ passwordHash, passwordChangedAt: new Date().toISOString() })
      .where(eq(adminUsers.id, id)),
    db.delete(adminSessions).where(eq(adminSessions.userId, id)),
    auditQuery(db, actor.id, "user.password_reset", "admin_user", String(id), { code: existing.username }),
  ]);
}
