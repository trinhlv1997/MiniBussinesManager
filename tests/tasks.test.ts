import { beforeEach, describe, expect, it } from "vitest";
import { addDays, vnToday } from "../src/shared/format";
import { api, createAdmin, loginAsAdmin, sessionCookie } from "./helpers";

const PASSWORD = "mat-khau-cong-viec-01";
let admin = "";

const as = (cookie: string) => ({
  get: (path: string) => api(path, { cookie }),
  send: (path: string, method: string, body?: unknown) => api(path, { method, body, cookie }),
});
const data = async <T>(response: Response) => ((await response.json()) as { data: T }).data;
const errorOf = async (response: Response) => ((await response.json()) as { error: { code: string; fields?: Record<string, string> } }).error;

type Account = { id: number; cookie: string };
async function account(username: string, role: "admin" | "manager" | "employee"): Promise<Account> {
  const created = await as(admin).send("/api/users", "POST", { username, displayName: username, password: PASSWORD, role });
  expect(created.status, username).toBe(201);
  const { id } = await data<{ id: number }>(created);
  const login = await api("/api/auth/login", { body: { username, password: PASSWORD } });
  expect(login.status).toBe(200);
  return { id, cookie: sessionCookie(login) };
}

const today = vnToday();
const task = (assigneeId: number, extra: object = {}) => ({
  title: "Kiểm tra kho quý 4",
  description: "Đếm lại hàng tồn",
  assigneeId,
  priority: "high",
  startDate: today,
  dueDate: addDays(today, 3),
  ...extra,
});
const createTask = async (cookie: string, body: object) => {
  const response = await as(cookie).send("/api/tasks", "POST", body);
  expect(response.status).toBe(201);
  return data<{ id: number; status: string; assignerId: number }>(response);
};
const move = (cookie: string, id: number, status: string, from?: string) =>
  as(cookie).send(`/api/tasks/${id}/status`, "POST", { status, from });
const boardIds = async (cookie: string, query = "") =>
  (await data<{ id: number }[]>(await as(cookie).get(`/api/tasks${query}`))).map((t) => t.id).sort();

let manager: Account;
let member: Account;
let outsider: Account;

beforeEach(async () => {
  await createAdmin();
  admin = await loginAsAdmin();
  manager = await account("ql.ban-hang", "manager");
  member = await account("nv.trong-nhom", "employee");
  outsider = await account("nv.ngoai-nhom", "employee");
  const team = await as(admin).send("/api/teams", "POST", { name: "Bán hàng", managerId: manager.id, memberIds: [member.id] });
  expect(team.status).toBe(201);
});

describe("roles and modules", () => {
  it("gives managers reports and their team, but not admin screens", async () => {
    expect((await as(manager.cookie).get("/api/reports/customers")).status).toBe(200);
    for (const path of ["/api/users", "/api/audit-logs", "/api/employees", "/api/dashboard/summary"]) {
      expect((await as(manager.cookie).get(path)).status, path).toBe(403);
    }
    expect((await as(member.cookie).get("/api/tasks")).status).toBe(200);
    expect((await as(member.cookie).get("/api/teams")).status).toBe(403);
    const me = await data<{ admin: { role: string } }>(await as(manager.cookie).get("/api/auth/me"));
    expect(me.admin.role).toBe("manager");
  });

  it("validates teams: one team per person, unique names, active leader", async () => {
    const taken = await as(admin).send("/api/teams", "POST", { name: "Kho", managerId: manager.id, memberIds: [member.id] });
    expect((await errorOf(taken)).fields?.memberIds).toContain("Bán hàng");
    const duplicate = await as(admin).send("/api/teams", "POST", { name: "Bán hàng", managerId: null, memberIds: [] });
    expect((await errorOf(duplicate)).fields?.name).toBeDefined();
    await as(admin).send(`/api/users/${outsider.id}`, "PUT", { displayName: "x", role: "employee", employeeId: null, active: false });
    const locked = await as(admin).send("/api/teams", "POST", { name: "Kho", managerId: outsider.id, memberIds: [] });
    expect((await errorOf(locked)).fields?.managerId).toBeDefined();
  });
});

describe("team management", () => {
  const roleOf = async (id: number) =>
    (await data<{ id: number; role: string }[]>(await as(admin).get("/api/users"))).find((u) => u.id === id)?.role;

  it("promotes an employee chosen as team leader to manager", async () => {
    const created = await as(admin).send("/api/teams", "POST", { name: "Kho", managerId: outsider.id, memberIds: [] });
    expect(created.status).toBe(201);
    expect(await roleOf(outsider.id)).toBe("manager");
    // Đăng nhập lại không cần: quyền đọc từ DB ở mỗi request.
    expect((await as(outsider.cookie).get("/api/teams")).status).toBe(200);
  });

  it("creates accounts for employee profiles added as members, all in one save", async () => {
    const staff = await data<{ id: number }>(await as(admin).send("/api/employees", "POST", { fullName: "Ngô Phương Linh", status: "active" }));
    const candidates = await data<{ key: string; userId: number | null; employeeId: number | null }[]>(await as(admin).get("/api/teams/candidates"));
    expect(candidates.find((c) => c.employeeId === staff.id)).toMatchObject({ key: `e${staff.id}`, userId: null });

    const teams = await data<{ id: number }[]>(await as(admin).get("/api/teams"));
    const body = { name: "Bán hàng", managerId: manager.id, memberIds: [member.id], newMembers: [{ employeeId: staff.id, username: "linh.np", password: "12345678" }] };
    const saved = await as(admin).send(`/api/teams/${teams[0]!.id}`, "PUT", body);
    expect(saved.status).toBe(200);
    expect((await data<{ memberIds: number[] }>(saved)).memberIds).toHaveLength(2);
    const login = await api("/api/auth/login", { body: { username: "linh.np", password: "12345678" } });
    expect(login.status).toBe(200);
    expect((await data<{ admin: { role: string; employeeId: number } }>(login)).admin).toMatchObject({ role: "employee", employeeId: staff.id });

    // Lỗi ở một tài khoản mới thì không tài khoản nào được tạo và nhóm không đổi.
    const other = await data<{ id: number }>(await as(admin).send("/api/employees", "POST", { fullName: "Đỗ Thanh Tùng", status: "active" }));
    const bad = await as(admin).send(`/api/teams/${teams[0]!.id}`, "PUT", {
      ...body,
      memberIds: [member.id],
      newMembers: [{ employeeId: other.id, username: "linh.np", password: "12345678" }],
    });
    expect(bad.status).toBe(422);
    expect((await errorOf(bad)).fields?.["newMembers.0.username"]).toBeDefined();
    const tooMany = await as(admin).send(`/api/teams/${teams[0]!.id}`, "PUT", {
      ...body,
      newMembers: [1, 2, 3, 4].map((n) => ({ employeeId: other.id, username: `x${n}`, password: "12345678" })),
    });
    expect(tooMany.status).toBe(422);
  });

  it("lets a manager see only their team and change only its members", async () => {
    const other = await as(admin).send("/api/teams", "POST", { name: "Kho", managerId: null, memberIds: [] });
    const otherId = (await data<{ id: number }>(other)).id;
    const mine = await data<{ id: number; name: string }[]>(await as(manager.cookie).get("/api/teams"));
    expect(mine.map((t) => t.name)).toEqual(["Bán hàng"]);

    const add = await as(manager.cookie).send(`/api/teams/${mine[0]!.id}/members`, "PUT", { memberIds: [member.id, outsider.id] });
    expect(add.status).toBe(200);
    expect((await data<{ memberIds: number[] }>(add)).memberIds.sort()).toEqual([member.id, outsider.id].sort());
    // Thành viên mới → Quản lý giao việc được cho họ.
    expect((await as(manager.cookie).send("/api/tasks", "POST", task(outsider.id))).status).toBe(201);

    expect((await as(manager.cookie).send(`/api/teams/${otherId}/members`, "PUT", { memberIds: [] })).status).toBe(404);
    expect((await as(manager.cookie).send(`/api/teams/${mine[0]!.id}`, "PUT", { name: "Đổi tên", managerId: manager.id, memberIds: [] })).status).toBe(403);
    expect((await as(manager.cookie).send("/api/teams", "POST", { name: "Mới", managerId: manager.id, memberIds: [] })).status).toBe(403);
    expect((await as(manager.cookie).send(`/api/teams/${mine[0]!.id}`, "DELETE")).status).toBe(403);
    expect((await as(member.cookie).get("/api/teams")).status).toBe(403);
  });
});

describe("creating and seeing tasks", () => {
  it("lets a manager assign only to their team (or themselves); employees cannot create", async () => {
    const own = await createTask(manager.cookie, task(member.id));
    expect(own.assignerId).toBe(manager.id);
    await createTask(manager.cookie, task(manager.id));

    const outside = await as(manager.cookie).send("/api/tasks", "POST", task(outsider.id));
    expect(outside.status).toBe(422);
    expect((await errorOf(outside)).fields?.assigneeId).toBeDefined();

    expect((await as(member.cookie).send("/api/tasks", "POST", task(member.id))).status).toBe(403);
    await createTask(admin, task(outsider.id));
  });

  it("scopes the board: employee sees own tasks, manager sees the team, admin sees all", async () => {
    const forMember = await createTask(manager.cookie, task(member.id));
    const forOutsider = await createTask(admin, task(outsider.id));
    const byAdminForMember = await createTask(admin, task(member.id, { title: "Việc admin giao" }));

    expect(await boardIds(member.cookie)).toEqual([forMember.id, byAdminForMember.id].sort());
    expect(await boardIds(outsider.cookie)).toEqual([forOutsider.id]);
    expect(await boardIds(manager.cookie)).toEqual([forMember.id, byAdminForMember.id].sort());
    expect(await boardIds(admin)).toHaveLength(3);

    // Ngoài phạm vi thì như không tồn tại.
    expect((await as(member.cookie).get(`/api/tasks/${forOutsider.id}`)).status).toBe(404);
    expect((await as(manager.cookie).get(`/api/tasks/${forOutsider.id}`)).status).toBe(404);
    expect((await move(manager.cookie, forOutsider.id, "in_progress")).status).toBe(404);
  });

  it("filters by search (accent-insensitive), status, priority and date range", async () => {
    const a = await createTask(admin, task(member.id, { title: "Gọi điện khách hàng", priority: "urgent", dueDate: addDays(today, 1) }));
    const b = await createTask(admin, task(member.id, { title: "Báo giá đại lý", priority: "low", startDate: addDays(today, 10), dueDate: addDays(today, 12) }));
    expect(await boardIds(admin, "?search=goi dien")).toEqual([a.id]);
    expect(await boardIds(admin, "?priority=low")).toEqual([b.id]);
    expect(await boardIds(admin, `?from=${addDays(today, 9)}&to=${addDays(today, 20)}`)).toEqual([b.id]);
    expect((await as(admin).get(`/api/tasks?from=${addDays(today, 5)}&to=${today}`)).status).toBe(422);
  });

  it("rejects bad input", async () => {
    const bad = await as(admin).send("/api/tasks", "POST", task(member.id, { title: "", priority: "rat-cao", startDate: addDays(today, 5), dueDate: today }));
    expect(bad.status).toBe(422);
    expect(Object.keys((await errorOf(bad)).fields ?? {}).sort()).toEqual(["priority", "title"]);
    const dates = await as(admin).send("/api/tasks", "POST", task(member.id, { startDate: addDays(today, 5), dueDate: today }));
    expect((await errorOf(dates)).fields?.dueDate).toBeDefined();
  });
});

describe("status transitions", () => {
  it("employee: open → in progress → done only, never cancel or reopen", async () => {
    const t = await createTask(manager.cookie, task(member.id));
    expect((await move(member.cookie, t.id, "done")).status).toBe(403);
    expect((await move(member.cookie, t.id, "cancelled")).status).toBe(403);
    expect((await move(member.cookie, t.id, "in_progress")).status).toBe(200);
    expect((await move(member.cookie, t.id, "review")).status).toBe(403);
    expect((await move(member.cookie, t.id, "done")).status).toBe(200);
    expect((await move(member.cookie, t.id, "open")).status).toBe(403);
    const detail = await data<{ status: string; completedAt: string | null; history: { field: string; oldValue: string; newValue: string; actorId: number }[] }>(
      await as(member.cookie).get(`/api/tasks/${t.id}`),
    );
    expect(detail.status).toBe("done");
    expect(detail.completedAt).not.toBeNull();
    expect(detail.history.map((h) => [h.field, h.oldValue, h.newValue])).toEqual([
      ["created", null, "Kiểm tra kho quý 4"],
      ["status", "open", "in_progress"],
      ["status", "in_progress", "done"],
    ]);
    expect(detail.history[2]!.actorId).toBe(member.id);
  });

  it("tasks that need review go through Review, which only a manager can close", async () => {
    const t = await createTask(manager.cookie, task(member.id, { requiresReview: true }));
    await move(member.cookie, t.id, "in_progress");
    expect((await move(member.cookie, t.id, "done")).status).toBe(403);
    expect((await move(member.cookie, t.id, "review")).status).toBe(200);
    expect((await move(member.cookie, t.id, "done")).status).toBe(403);
    expect((await move(manager.cookie, t.id, "in_progress")).status).toBe(200);
    await move(member.cookie, t.id, "review");
    expect((await move(manager.cookie, t.id, "done")).status).toBe(200);
    expect((await move(manager.cookie, t.id, "open")).status).toBe(200);
  });

  it("stores an optional reason with each status change", async () => {
    const t = await createTask(manager.cookie, task(member.id));
    expect((await as(member.cookie).send(`/api/tasks/${t.id}/status`, "POST", { status: "in_progress", note: "  Đã liên hệ kho  " })).status).toBe(200);
    expect((await as(manager.cookie).send(`/api/tasks/${t.id}/status`, "POST", { status: "cancelled", note: "x".repeat(501) })).status).toBe(422);
    expect((await move(manager.cookie, t.id, "cancelled")).status).toBe(200);
    const detail = await data<{ history: { field: string; note: string | null }[] }>(await as(admin).get(`/api/tasks/${t.id}`));
    expect(detail.history.filter((h) => h.field === "status").map((h) => h.note)).toEqual(["Đã liên hệ kho", null]);
  });

  it("manager can cancel; invalid jumps are refused; stale moves report a conflict", async () => {
    const t = await createTask(manager.cookie, task(member.id));
    expect((await move(manager.cookie, t.id, "review")).status).toBe(403);
    expect((await move(manager.cookie, t.id, "cancelled")).status).toBe(200);
    expect((await move(manager.cookie, t.id, "done")).status).toBe(403);

    const u = await createTask(manager.cookie, task(member.id));
    await move(member.cookie, u.id, "in_progress");
    const stale = await move(manager.cookie, u.id, "cancelled", "open");
    expect(stale.status).toBe(409);
    expect((await errorOf(stale)).code).toBe("CONFLICT");
  });
});

describe("editing, cancel requests and deleting", () => {
  it("only admin and the team manager edit; history records each changed field", async () => {
    const t = await createTask(manager.cookie, task(member.id));
    expect((await as(member.cookie).send(`/api/tasks/${t.id}`, "PUT", task(member.id, { title: "Sửa lén" }))).status).toBe(403);
    expect((await as(manager.cookie).send(`/api/tasks/${t.id}`, "PUT", task(outsider.id))).status).toBe(422);
    const edited = await as(manager.cookie).send(`/api/tasks/${t.id}`, "PUT", task(member.id, { priority: "urgent", dueDate: addDays(today, 7) }));
    expect(edited.status).toBe(200);
    const detail = await data<{ history: { field: string; oldValue: string; newValue: string }[] }>(await as(admin).get(`/api/tasks/${t.id}`));
    expect(detail.history.slice(1).map((h) => [h.field, h.oldValue, h.newValue])).toEqual([
      ["priority", "Cao", "Khẩn"],
      ["due_date", addDays(today, 3), addDays(today, 7)],
    ]);
  });

  it("employee sends a cancel request; manager rejects or cancels", async () => {
    const t = await createTask(manager.cookie, task(member.id));
    expect((await as(outsider.cookie).send(`/api/tasks/${t.id}/cancel-request`, "POST", { reason: "x" })).status).toBe(404);
    const request = await as(member.cookie).send(`/api/tasks/${t.id}/cancel-request`, "POST", { reason: "Khách đã hủy đơn" });
    expect(request.status).toBe(200);
    expect(await data<{ cancelRequestReason: string }>(request)).toMatchObject({ cancelRequestReason: "Khách đã hủy đơn" });
    expect((await as(member.cookie).send(`/api/tasks/${t.id}/cancel-request`, "POST", { reason: "lần 2" })).status).toBe(422);
    expect((await as(member.cookie).send(`/api/tasks/${t.id}/cancel-request/reject`, "POST", {})).status).toBe(403);

    const rejected = await data<{ cancelRequestedAt: string | null }>(await as(manager.cookie).send(`/api/tasks/${t.id}/cancel-request/reject`, "POST", {}));
    expect(rejected.cancelRequestedAt).toBeNull();

    await as(member.cookie).send(`/api/tasks/${t.id}/cancel-request`, "POST", { reason: "Lần nữa" });
    const cancelled = await data<{ status: string; cancelRequestedAt: string | null }>(await move(manager.cookie, t.id, "cancelled"));
    expect(cancelled).toMatchObject({ status: "cancelled", cancelRequestedAt: null });
  });

  it("only admin deletes", async () => {
    const t = await createTask(manager.cookie, task(member.id));
    expect((await as(manager.cookie).send(`/api/tasks/${t.id}`, "DELETE")).status).toBe(403);
    expect((await as(member.cookie).send(`/api/tasks/${t.id}`, "DELETE")).status).toBe(403);
    expect((await as(admin).send(`/api/tasks/${t.id}`, "DELETE")).status).toBe(200);
    expect((await as(admin).get(`/api/tasks/${t.id}`)).status).toBe(404);
  });

  it("people list marks who the viewer can assign to", async () => {
    const people = await data<{ id: number; assignable: boolean }[]>(await as(manager.cookie).get("/api/tasks/people"));
    const assignable = people.filter((p) => p.assignable).map((p) => p.id).sort();
    expect(assignable).toEqual([manager.id, member.id].sort());
    const forMember = await data<{ assignable: boolean }[]>(await as(member.cookie).get("/api/tasks/people"));
    expect(forMember.every((p) => !p.assignable)).toBe(true);
  });
});
