import { and, asc, eq, getTableColumns, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { addDays, vnDayStartUtc, vnToday } from "@shared/format";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  canDeleteTasks,
  canManageTasks,
  canTransition,
  isFinalStatus,
  type TaskHistoryField,
  type TaskStatus,
} from "@shared/tasks";
import { toSearchText } from "@shared/text";
import type { Task, TaskDetail, TaskPerson } from "@shared/types";
import type { TaskInput, TaskListQuery } from "@shared/validation/tasks";
import type { Db } from "../../db/client";
import { adminUsers, auditLogs, employees, taskHistory, teamMembers, teams, tasks } from "../../db/schema";
import type { Actor } from "../env";
import { auditQuery, matchSearch, notFound, omit, runBatch } from "../lib/db";
import { ApiError } from "../lib/errors";

/** Số task tối đa trả về cho một lần xem Kanban (giữ CPU và dung lượng phản hồi trong giới hạn Free). */
export const MAX_BOARD_TASKS = 500;
/** Không lọc theo ngày thì cột Hoàn thành / Đã hủy chỉ hiện việc kết thúc trong 30 ngày gần nhất. */
const FINISHED_VISIBLE_DAYS = 30;

const columns = omit(getTableColumns(tasks), ["searchText"]);

const forbidden = (message: string) => new ApiError(403, "FORBIDDEN", message);
const invalid = (field: string, message: string) => new ApiError(422, "VALIDATION_ERROR", message, { [field]: message });
const conflict = () =>
  new ApiError(409, "CONFLICT", "Công việc vừa được người khác cập nhật. Vui lòng tải lại để xem trạng thái mới.");

/** Id các thành viên trong những nhóm mà tài khoản này làm trưởng nhóm. */
const managedMemberIds = (db: Db, managerId: number) =>
  db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teams.managerId, managerId));

/**
 * PHẠM VI DỮ LIỆU THEO VAI TRÒ (kiểm tra ở server, mọi truy vấn task đều đi qua đây):
 * - Admin: mọi task.
 * - Quản lý: task giao cho chính mình, task mình giao, và task của thành viên nhóm mình quản lý.
 * - Nhân viên: chỉ task giao cho chính mình.
 * Task ngoài phạm vi trả về "không tìm thấy", không lộ là có tồn tại.
 */
function scopeOf(db: Db, actor: Actor): SQL | undefined {
  if (actor.role === "admin") return undefined;
  if (actor.role === "manager") {
    return or(
      eq(tasks.assigneeId, actor.id),
      eq(tasks.assignerId, actor.id),
      inArray(tasks.assigneeId, managedMemberIds(db, actor.id)),
    );
  }
  return eq(tasks.assigneeId, actor.id);
}

/** Người mà tài khoản này được giao việc: Admin → mọi tài khoản đang hoạt động; Quản lý → mình + thành viên nhóm. */
async function assignableIds(db: Db, actor: Actor): Promise<Set<number> | "all"> {
  if (actor.role === "admin") return "all";
  if (actor.role !== "manager") return new Set();
  const members = await managedMemberIds(db, actor.id);
  return new Set([actor.id, ...members.map((member) => member.userId)]);
}

async function assertAssignable(db: Db, actor: Actor, assigneeId: number) {
  const [user] = await db
    .select({ active: adminUsers.active })
    .from(adminUsers)
    .where(eq(adminUsers.id, assigneeId))
    .limit(1);
  if (!user || !user.active) throw invalid("assigneeId", "Người nhận không tồn tại hoặc đã bị khoá");
  const allowed = await assignableIds(db, actor);
  if (allowed !== "all" && !allowed.has(assigneeId)) {
    throw invalid("assigneeId", "Bạn chỉ được giao việc cho thành viên trong nhóm mình quản lý");
  }
}

/** Mọi tài khoản (tên + ảnh), kèm cờ "được giao việc" theo quyền của người đang xem. */
export async function listTaskPeople(db: Db, actor: Actor): Promise<TaskPerson[]> {
  const [rows, allowed] = await Promise.all([
    db
      .select({
        id: adminUsers.id,
        displayName: adminUsers.displayName,
        role: adminUsers.role,
        active: adminUsers.active,
        avatar: sql<string | null>`${employees.avatar}`.as("employee_avatar"),
      })
      .from(adminUsers)
      .leftJoin(employees, eq(employees.id, adminUsers.employeeId))
      .orderBy(asc(adminUsers.displayName)),
    assignableIds(db, actor),
  ]);
  return rows.map((row) => ({ ...row, assignable: row.active && (allowed === "all" || allowed.has(row.id)) }));
}

const NOW = sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

const PRIORITY_RANK = sql`CASE ${tasks.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`;

export async function listTasks(db: Db, actor: Actor, query: TaskListQuery): Promise<Task[]> {
  const hasRange = Boolean(query.from || query.to);
  const recentSince = vnDayStartUtc(addDays(vnToday(), -FINISHED_VISIBLE_DAYS));
  const where = and(
    scopeOf(db, actor),
    query.search ? matchSearch(tasks.searchText, query.search) : undefined,
    query.assigneeId ? eq(tasks.assigneeId, query.assigneeId) : undefined,
    query.status ? eq(tasks.status, query.status) : undefined,
    query.priority ? eq(tasks.priority, query.priority) : undefined,
    // Task "nằm trong" khoảng ngày khi [bắt đầu, hạn chót] giao với [from, to].
    query.to ? lte(sql`COALESCE(${tasks.startDate}, ${tasks.dueDate})`, query.to) : undefined,
    query.from ? gte(tasks.dueDate, query.from) : undefined,
    hasRange || query.status
      ? undefined
      : or(inArray(tasks.status, ["open", "in_progress", "review"]), gte(tasks.updatedAt, recentSince)),
  );
  return db
    .select(columns)
    .from(tasks)
    .where(where)
    .orderBy(PRIORITY_RANK, asc(tasks.dueDate), asc(tasks.id))
    .limit(MAX_BOARD_TASKS);
}

async function findTask(db: Db, actor: Actor, id: number): Promise<Task> {
  const [row] = await db
    .select(columns)
    .from(tasks)
    .where(and(eq(tasks.id, id), scopeOf(db, actor)))
    .limit(1);
  if (!row) throw notFound("Không tìm thấy công việc");
  return row;
}

export async function getTask(db: Db, actor: Actor, id: number): Promise<TaskDetail> {
  const task = await findTask(db, actor, id);
  const history = await db
    .select({
      id: taskHistory.id,
      actorId: taskHistory.actorId,
      field: sql<TaskHistoryField>`${taskHistory.field}`,
      oldValue: taskHistory.oldValue,
      newValue: taskHistory.newValue,
      note: taskHistory.note,
      createdAt: taskHistory.createdAt,
    })
    .from(taskHistory)
    .where(eq(taskHistory.taskId, id))
    .orderBy(asc(taskHistory.id));
  return { ...task, history };
}

type HistoryRow = { field: TaskHistoryField; oldValue: string | null; newValue: string | null };

const historyQuery = (db: Db, actor: Actor, taskId: number | SQL, row: HistoryRow) =>
  db.insert(taskHistory).values({ taskId: taskId as number, actorId: actor.id, ...row });

/** Id của task vừa thêm trong cùng batch (batch là một transaction nên MAX(id) chính là task đó). */
const NEW_TASK_ID = sql`(SELECT MAX(id) FROM tasks)`;

export async function createTask(db: Db, actor: Actor, input: TaskInput): Promise<Task> {
  if (!canManageTasks(actor.role)) throw forbidden("Bạn không có quyền tạo công việc");
  await assertAssignable(db, actor, input.assigneeId);

  await runBatch(db, [
    db.insert(tasks).values({
      ...input,
      assignerId: actor.id,
      searchText: toSearchText(input.title, input.description),
      createdBy: actor.id,
      updatedBy: actor.id,
    }),
    historyQuery(db, actor, NEW_TASK_ID, { field: "created", oldValue: null, newValue: input.title }),
    auditQuery(db, actor.id, "task.create", "task", sql<string>`CAST(${NEW_TASK_ID} AS TEXT)`, { code: input.title }),
  ]);
  const [created] = await db
    .select(columns)
    .from(tasks)
    .where(eq(tasks.createdBy, actor.id))
    .orderBy(sql`${tasks.id} DESC`)
    .limit(1);
  return created!;
}

/** So sánh trước / sau để ghi lịch sử từng trường thay đổi (giá trị lưu dạng chữ dễ đọc). */
function diffTask(before: Task, after: TaskInput): HistoryRow[] {
  const rows: HistoryRow[] = [];
  const add = (field: TaskHistoryField, oldValue: string | null, newValue: string | null) => {
    if (oldValue !== newValue) rows.push({ field, oldValue, newValue });
  };
  add("title", before.title, after.title);
  add("description", before.description, after.description);
  // Người nhận lưu id tài khoản; giao diện đổi sang tên.
  add("assignee", String(before.assigneeId), String(after.assigneeId));
  add("priority", TASK_PRIORITY_LABELS[before.priority], TASK_PRIORITY_LABELS[after.priority]);
  add("start_date", before.startDate, after.startDate);
  add("due_date", before.dueDate, after.dueDate);
  add("requires_review", before.requiresReview ? "Có" : "Không", after.requiresReview ? "Có" : "Không");
  return rows;
}

export async function updateTask(db: Db, actor: Actor, id: number, input: TaskInput): Promise<Task> {
  if (!canManageTasks(actor.role)) throw forbidden("Bạn không có quyền sửa công việc");
  const existing = await findTask(db, actor, id);
  if (input.assigneeId !== existing.assigneeId) await assertAssignable(db, actor, input.assigneeId);

  const changes = diffTask(existing, input);
  if (changes.length === 0) return existing;
  await runBatch(db, [
    db
      .update(tasks)
      .set({ ...input, searchText: toSearchText(input.title, input.description), updatedBy: actor.id })
      .where(eq(tasks.id, id)),
    ...changes.map((change) => historyQuery(db, actor, id, change)),
    auditQuery(db, actor.id, "task.update", "task", String(id), { code: input.title }),
  ]);
  return findTask(db, actor, id);
}

/**
 * Đổi trạng thái. Kiểm tra 3 lớp:
 * 1. Task nằm trong phạm vi của người thao tác (scopeOf).
 * 2. Bước chuyển hợp lệ với vai trò (allowedTransitions trong shared/tasks.ts).
 * 3. Không ai đổi trước đó: UPDATE kèm điều kiện trạng thái cũ, 0 dòng đổi → báo xung đột.
 */
export async function changeTaskStatus(
  db: Db,
  actor: Actor,
  id: number,
  input: { status: TaskStatus; from?: TaskStatus; note?: string | null },
): Promise<Task> {
  const existing = await findTask(db, actor, id);
  if (input.from && input.from !== existing.status) throw conflict();
  if (existing.status === input.status) return existing;
  if (!canTransition(actor.role, existing, input.status)) {
    throw forbidden(
      `Bạn không được chuyển công việc từ "${TASK_STATUS_LABELS[existing.status]}" sang "${TASK_STATUS_LABELS[input.status]}"`,
    );
  }

  const finished = isFinalStatus(input.status);
  const [updated] = (await runBatch(db, [
    db
      .update(tasks)
      .set({
        status: input.status,
        completedAt: input.status === "done" ? new Date().toISOString() : null,
        // Task đã kết thúc thì yêu cầu hủy (nếu có) coi như đã xử lý.
        ...(finished ? { cancelRequestedAt: null, cancelRequestReason: null, cancelRequestedBy: null } : {}),
        updatedBy: actor.id,
      })
      .where(and(eq(tasks.id, id), eq(tasks.status, existing.status)))
      .returning({ id: tasks.id }),
    // Chỉ ghi lịch sử và nhật ký khi lệnh UPDATE ngay trước thật sự đổi được dòng nào
    // (changes() = số dòng lệnh trước vừa đổi; batch chạy tuần tự trong một transaction).
    // INSERT … SELECT: Drizzle ghi tên cột theo thứ tự khai báo trong schema.ts
    // (id, task_id, actor_id, field, old_value, new_value, note, created_at); id NULL để SQLite tự tăng.
    db.insert(taskHistory).select(
      sql`SELECT NULL, ${id}, ${actor.id}, 'status', ${existing.status}, ${input.status}, ${input.note ?? null}, ${NOW}
          WHERE changes() > 0`,
    ),
    db.insert(auditLogs).select(
      sql`SELECT NULL, ${actor.id}, 'task.status', 'task', ${String(id)},
                 ${JSON.stringify({ code: existing.title, from: existing.status, to: input.status, note: input.note ?? undefined })}, ${NOW}
          WHERE changes() > 0`,
    ),
  ])) as [{ id: number }[]];
  if (updated.length === 0) throw conflict();
  return findTask(db, actor, id);
}

/** Nhân viên (người nhận) gửi yêu cầu hủy; Quản lý / Admin quyết định hủy hay giữ. */
export async function requestTaskCancel(db: Db, actor: Actor, id: number, reason: string): Promise<Task> {
  const existing = await findTask(db, actor, id);
  if (existing.assigneeId !== actor.id) throw forbidden("Chỉ người nhận việc mới gửi được yêu cầu hủy");
  if (isFinalStatus(existing.status)) throw invalid("reason", "Công việc đã kết thúc, không cần hủy");
  if (existing.cancelRequestedAt) throw invalid("reason", "Đã có yêu cầu hủy đang chờ xử lý");

  await runBatch(db, [
    db
      .update(tasks)
      .set({
        cancelRequestedAt: new Date().toISOString(),
        cancelRequestReason: reason,
        cancelRequestedBy: actor.id,
        updatedBy: actor.id,
      })
      .where(eq(tasks.id, id)),
    historyQuery(db, actor, id, { field: "cancel_request", oldValue: null, newValue: `Gửi yêu cầu: ${reason}` }),
    auditQuery(db, actor.id, "task.cancel_request", "task", String(id), { code: existing.title }),
  ]);
  return findTask(db, actor, id);
}

export async function rejectTaskCancel(db: Db, actor: Actor, id: number): Promise<Task> {
  if (!canManageTasks(actor.role)) throw forbidden("Bạn không có quyền xử lý yêu cầu hủy");
  const existing = await findTask(db, actor, id);
  if (!existing.cancelRequestedAt) return existing;
  await runBatch(db, [
    db
      .update(tasks)
      .set({ cancelRequestedAt: null, cancelRequestReason: null, cancelRequestedBy: null, updatedBy: actor.id })
      .where(eq(tasks.id, id)),
    historyQuery(db, actor, id, { field: "cancel_request", oldValue: existing.cancelRequestReason, newValue: "Từ chối, tiếp tục làm" }),
    auditQuery(db, actor.id, "task.cancel_reject", "task", String(id), { code: existing.title }),
  ]);
  return findTask(db, actor, id);
}

export async function deleteTask(db: Db, actor: Actor, id: number): Promise<void> {
  if (!canDeleteTasks(actor.role)) throw forbidden("Chỉ Quản trị viên được xoá công việc");
  const existing = await findTask(db, actor, id);
  await runBatch(db, [
    db.delete(tasks).where(eq(tasks.id, id)),
    auditQuery(db, actor.id, "task.delete", "task", String(id), { code: existing.title }),
  ]);
}
