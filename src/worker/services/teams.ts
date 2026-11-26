import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Team, TeamCandidate } from "@shared/types";
import type { TeamInput, TeamMembersInput } from "@shared/validation/tasks";
import type { Db } from "../../db/client";
import { adminUsers, employees, teamMembers, teams } from "../../db/schema";
import type { Actor } from "../env";
import { auditQuery, dbErrorText, notFound, runBatch } from "../lib/db";
import { ApiError } from "../lib/errors";
import { hashPassword } from "../lib/password";

/**
 * PHÂN QUYỀN NHÓM (kiểm tra ở đây, không dựa vào giao diện):
 * - Quản trị: xem mọi nhóm; tạo / sửa / xoá nhóm; chọn trưởng nhóm (tài khoản Nhân viên được nâng lên
 *   Quản lý); thêm thành viên kể cả nhân viên chưa có tài khoản (tạo tài khoản luôn).
 * - Quản lý: chỉ xem nhóm mình làm trưởng; chỉ thêm / bớt thành viên đã có tài khoản.
 */
const invalid = (field: string, message: string) => new ApiError(422, "VALIDATION_ERROR", message, { [field]: message });
const forbidden = (message: string) => new ApiError(403, "FORBIDDEN", message);
const adminOnly = (actor: Actor) => {
  if (actor.role !== "admin") throw forbidden("Chỉ Quản trị viên được tạo, xoá nhóm hoặc đổi trưởng nhóm");
};

async function allTeams(db: Db): Promise<Team[]> {
  const [rows, members] = await db.batch([
    db.select().from(teams).orderBy(asc(teams.name)),
    db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId }).from(teamMembers),
  ]);
  return rows.map((team) => ({
    ...team,
    memberIds: members.filter((member) => member.teamId === team.id).map((member) => member.userId),
  }));
}

/** Quản trị thấy mọi nhóm; Quản lý chỉ thấy nhóm mình làm trưởng. */
export async function listTeams(db: Db, actor: Actor): Promise<Team[]> {
  const rows = await allTeams(db);
  return actor.role === "admin" ? rows : rows.filter((team) => team.managerId === actor.id);
}

async function findTeam(db: Db, actor: Actor, id: number): Promise<Team> {
  const team = (await listTeams(db, actor)).find((row) => row.id === id);
  if (!team) throw notFound("Không tìm thấy nhóm");
  return team;
}

/** Mọi tài khoản + hồ sơ nhân viên chưa có tài khoản, kèm nhóm hiện tại, để chọn thành viên / trưởng nhóm. */
export async function listTeamCandidates(db: Db): Promise<TeamCandidate[]> {
  const [accounts, loose, memberships] = await db.batch([
    db
      .select({
        userId: adminUsers.id,
        username: adminUsers.username,
        role: adminUsers.role,
        active: adminUsers.active,
        employeeId: adminUsers.employeeId,
        employeeCode: sql<string | null>`${employees.code}`.as("employee_code"),
        name: adminUsers.displayName,
        position: sql<string | null>`${employees.position}`.as("employee_position"),
      })
      .from(adminUsers)
      .leftJoin(employees, eq(employees.id, adminUsers.employeeId)),
    // Hồ sơ nhân viên đang làm / tạm nghỉ chưa gắn tài khoản nào.
    db
      .select({ employeeId: employees.id, employeeCode: employees.code, name: employees.fullName, position: employees.position })
      .from(employees)
      .where(
        and(
          isNull(employees.deletedAt),
          ne(employees.status, "resigned"),
          sql`NOT EXISTS (SELECT 1 FROM admin_users u WHERE u.employee_id = ${employees.id})`,
        ),
      ),
    db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId }).from(teamMembers),
  ]);
  const teamOf = new Map(memberships.map((row) => [row.userId, row.teamId]));
  const rows: TeamCandidate[] = [
    ...accounts.map((row) => ({ ...row, key: `u${row.userId}`, teamId: teamOf.get(row.userId) ?? null })),
    ...loose.map((row) => ({ ...row, key: `e${row.employeeId}`, userId: null, username: null, role: null, active: true, teamId: null })),
  ];
  return rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

/** Thành viên phải là tài khoản đang hoạt động và không thuộc nhóm khác (mỗi người một nhóm). */
async function validateMembers(db: Db, ids: number[], teamId?: number) {
  const memberIds = [...new Set(ids)];
  if (memberIds.length === 0) return memberIds;
  const users = await db
    .select({ id: adminUsers.id, displayName: adminUsers.displayName, active: adminUsers.active })
    .from(adminUsers)
    .where(inArray(adminUsers.id, memberIds));
  if (users.length !== memberIds.length || users.some((user) => !user.active)) {
    throw invalid("memberIds", "Có thành viên không tồn tại hoặc đã bị khoá");
  }
  const taken = await db
    .select({ userId: teamMembers.userId, teamName: teams.name })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(inArray(teamMembers.userId, memberIds), teamId ? ne(teamMembers.teamId, teamId) : undefined));
  if (taken.length > 0) {
    const names = taken.map((row) => `${users.find((user) => user.id === row.userId)?.displayName} (${row.teamName})`);
    throw invalid("memberIds", `Đã thuộc nhóm khác: ${names.join(", ")}`);
  }
  return memberIds;
}

/** Trưởng nhóm: tài khoản đang hoạt động bất kỳ. Trả về true nếu cần nâng tài khoản Nhân viên lên Quản lý. */
async function validateLeader(db: Db, managerId: number | null): Promise<boolean> {
  if (managerId === null) return false;
  const [leader] = await db
    .select({ role: adminUsers.role, active: adminUsers.active })
    .from(adminUsers)
    .where(eq(adminUsers.id, managerId))
    .limit(1);
  if (!leader || !leader.active) throw invalid("managerId", "Trưởng nhóm phải là tài khoản đang hoạt động");
  return leader.role === "employee";
}

/** Kiểm tra hồ sơ nhân viên sẽ được tạo tài khoản: còn làm việc, chưa có tài khoản, tên đăng nhập chưa dùng. */
async function validateNewMembers(db: Db, input: TeamInput) {
  const { newMembers } = input;
  if (newMembers.length === 0) return;
  const field = (index: number, name: string) => `newMembers.${index}.${name}`;
  const employeeIds = newMembers.map((member) => member.employeeId);
  const usernames = newMembers.map((member) => member.username);
  newMembers.forEach((member, index) => {
    if (employeeIds.indexOf(member.employeeId) !== index) throw invalid(field(index, "employeeId"), "Nhân viên bị chọn trùng");
    if (usernames.indexOf(member.username) !== index) throw invalid(field(index, "username"), "Tên đăng nhập bị trùng");
  });
  const [profiles, linked, existingNames] = await db.batch([
    db
      .select({ id: employees.id })
      .from(employees)
      .where(and(inArray(employees.id, employeeIds), isNull(employees.deletedAt), ne(employees.status, "resigned"))),
    db.select({ employeeId: adminUsers.employeeId }).from(adminUsers).where(inArray(adminUsers.employeeId, employeeIds)),
    db.select({ username: adminUsers.username }).from(adminUsers).where(inArray(adminUsers.username, usernames)),
  ]);
  newMembers.forEach((member, index) => {
    if (!profiles.some((row) => row.id === member.employeeId)) throw invalid(field(index, "employeeId"), "Nhân viên không tồn tại hoặc đã nghỉ việc");
    if (linked.some((row) => row.employeeId === member.employeeId)) throw invalid(field(index, "employeeId"), "Nhân viên này đã có tài khoản");
    if (existingNames.some((row) => row.username === member.username)) throw invalid(field(index, "username"), "Tên đăng nhập đã tồn tại");
  });
}

/** Lệnh tạo tài khoản Nhân viên cho thành viên mới (mật khẩu băm trước, ngoài transaction). */
async function newAccountQueries(db: Db, actor: Actor, input: TeamInput, pepper: string): Promise<BatchItem<"sqlite">[]> {
  const queries: BatchItem<"sqlite">[] = [];
  for (const member of input.newMembers) {
    const passwordHash = await hashPassword(member.password, pepper);
    queries.push(
      db.insert(adminUsers).select(
        // Cột theo thứ tự trong schema.ts: id, username, display_name, password_hash, password_changed_at,
        // user_role, role, employee_id, active, last_login_at, created_at, updated_at.
        sql`SELECT NULL, ${member.username}, full_name, ${passwordHash}, ${NOW}, 'employee', 'employee', id, 1, NULL, ${NOW}, ${NOW}
            FROM employees WHERE id = ${member.employeeId}`,
      ),
      auditQuery(db, actor.id, "user.create", "admin_user", sql<string>`CAST(last_insert_rowid() AS TEXT)`, {
        code: member.username,
        role: "employee",
        via: "team",
      }),
    );
  }
  return queries;
}

const NOW = sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/** Ghi lại danh sách thành viên của nhóm tên `name` (tên là duy nhất): tài khoản có sẵn + tài khoản vừa tạo. */
function replaceMembers(db: Db, name: string, memberIds: number[], newUsernames: string[]): BatchItem<"sqlite">[] {
  const teamId = sql`(SELECT id FROM teams WHERE name = ${name})`;
  return [
    db.delete(teamMembers).where(eq(teamMembers.teamId, teamId as unknown as number)),
    // INSERT … SELECT liệt kê đủ cột theo thứ tự (team_id, user_id, created_at).
    ...(memberIds.length + newUsernames.length > 0
      ? [
          db.insert(teamMembers).select(
            sql`SELECT ${teamId}, id, ${NOW} FROM admin_users
                WHERE id IN (SELECT value FROM json_each(${JSON.stringify(memberIds)}))
                   OR username IN (SELECT value FROM json_each(${JSON.stringify(newUsernames)}))`,
          ),
        ]
      : []),
  ];
}

/** Nâng tài khoản Nhân viên được chọn làm trưởng nhóm lên vai trò Quản lý. */
const promoteLeader = (db: Db, actor: Actor, managerId: number): BatchItem<"sqlite">[] => [
  db.update(adminUsers).set({ role: "manager", legacyRole: "employee" }).where(and(eq(adminUsers.id, managerId), eq(adminUsers.role, "employee"))),
  auditQuery(db, actor.id, "user.update", "admin_user", String(managerId), { role: "manager", via: "team_leader" }),
];

function rethrowDuplicate(error: unknown): never {
  const text = dbErrorText(error);
  if (text.includes("teams.name")) throw invalid("name", "Tên nhóm đã tồn tại");
  if (text.includes("team_members.user_id")) throw invalid("memberIds", "Có thành viên vừa được thêm vào nhóm khác");
  if (text.includes("admin_users.username")) throw invalid("memberIds", "Có tên đăng nhập vừa được người khác dùng");
  if (text.includes("admin_users.employee_id") || text.includes("admin_users_employee_unique")) {
    throw invalid("memberIds", "Có nhân viên vừa được tạo tài khoản ở nơi khác");
  }
  throw error;
}

/** Kiểm tra chung cho tạo / sửa nhóm (Quản trị); trả về các lệnh tạo tài khoản và nâng quyền. */
async function prepareTeam(db: Db, actor: Actor, input: TeamInput, pepper: string, teamId?: number) {
  adminOnly(actor);
  const promote = await validateLeader(db, input.managerId);
  const memberIds = await validateMembers(db, input.memberIds, teamId);
  await validateNewMembers(db, input);
  const accounts = await newAccountQueries(db, actor, input, pepper);
  return {
    memberIds,
    before: [...accounts, ...(promote && input.managerId ? promoteLeader(db, actor, input.managerId) : [])],
    newUsernames: input.newMembers.map((member) => member.username),
  };
}

export async function createTeam(db: Db, actor: Actor, input: TeamInput, pepper: string) {
  const { memberIds, before, newUsernames } = await prepareTeam(db, actor, input, pepper);
  try {
    await runBatch(db, [
      ...before,
      db.insert(teams).values({
        name: input.name,
        description: input.description,
        managerId: input.managerId,
        createdBy: actor.id,
        updatedBy: actor.id,
      }),
      ...replaceMembers(db, input.name, memberIds, newUsernames),
      auditQuery(db, actor.id, "team.create", "team", sql<string>`CAST((SELECT id FROM teams WHERE name = ${input.name}) AS TEXT)`, {
        code: input.name,
      }),
    ]);
  } catch (error) {
    rethrowDuplicate(error);
  }
  return (await allTeams(db)).find((team) => team.name === input.name)!;
}

export async function updateTeam(db: Db, actor: Actor, id: number, input: TeamInput, pepper: string) {
  adminOnly(actor);
  await findTeam(db, actor, id);
  const { memberIds, before, newUsernames } = await prepareTeam(db, actor, input, pepper, id);
  try {
    // Một transaction: tạo tài khoản, nâng quyền trưởng nhóm, đổi thông tin nhóm, ghi lại thành viên.
    await runBatch(db, [
      ...before,
      db
        .update(teams)
        .set({ name: input.name, description: input.description, managerId: input.managerId, updatedBy: actor.id })
        .where(eq(teams.id, id)),
      ...replaceMembers(db, input.name, memberIds, newUsernames),
      auditQuery(db, actor.id, "team.update", "team", String(id), { code: input.name }),
    ]);
  } catch (error) {
    rethrowDuplicate(error);
  }
  return findTeam(db, actor, id);
}

/** Quản lý thêm / bớt thành viên (đã có tài khoản) cho nhóm mình; Quản trị dùng được cho mọi nhóm. */
export async function updateTeamMembers(db: Db, actor: Actor, id: number, input: TeamMembersInput) {
  const team = await findTeam(db, actor, id);
  const memberIds = await validateMembers(db, input.memberIds, id);
  try {
    await runBatch(db, [
      ...replaceMembers(db, team.name, memberIds, []),
      db.update(teams).set({ updatedBy: actor.id }).where(eq(teams.id, id)),
      auditQuery(db, actor.id, "team.update", "team", String(id), { code: team.name, members: memberIds.length }),
    ]);
  } catch (error) {
    rethrowDuplicate(error);
  }
  return findTeam(db, actor, id);
}

/** Xoá nhóm chỉ bỏ liên kết thành viên; công việc đã giao giữ nguyên. */
export async function deleteTeam(db: Db, actor: Actor, id: number) {
  adminOnly(actor);
  const team = await findTeam(db, actor, id);
  await runBatch(db, [
    db.delete(teams).where(eq(teams.id, id)),
    auditQuery(db, actor.id, "team.delete", "team", String(id), { code: team.name }),
  ]);
}
