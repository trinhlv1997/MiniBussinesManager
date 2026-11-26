import { Hono } from "hono";
import { cancelRequestSchema, taskListQuery, taskSchema, taskStatusSchema, teamMembersSchema, teamSchema } from "@shared/validation/tasks";
import { createDb } from "../../db/client";
import type { AppEnv } from "../env";
import { ok, parseJson } from "../lib/http";
import { parseId, parseQuery } from "../lib/resource-routes";
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  getTask,
  listTaskPeople,
  listTasks,
  rejectTaskCancel,
  requestTaskCancel,
  updateTask,
} from "../services/tasks";
import { createTeam, deleteTeam, listTeamCandidates, listTeams, updateTeam, updateTeamMembers } from "../services/teams";

/**
 * Công việc (mọi vai trò có module "tasks"). Quyền chi tiết theo vai trò và phạm vi nhóm
 * được kiểm tra trong services/tasks.ts, không dựa vào việc giao diện ẩn nút.
 */
export const taskRoutes = new Hono<AppEnv>()
  .get("/", async (c) => ok(c, await listTasks(createDb(c.env.DB), c.get("admin"), parseQuery(c, taskListQuery))))
  .get("/people", async (c) => ok(c, await listTaskPeople(createDb(c.env.DB), c.get("admin"))))
  .get("/:id{[0-9]+}", async (c) => ok(c, await getTask(createDb(c.env.DB), c.get("admin"), parseId(c))))
  .post("/", async (c) => {
    const input = await parseJson(c, taskSchema);
    return ok(c, await createTask(createDb(c.env.DB), c.get("admin"), input), 201);
  })
  .put("/:id{[0-9]+}", async (c) => {
    const input = await parseJson(c, taskSchema);
    return ok(c, await updateTask(createDb(c.env.DB), c.get("admin"), parseId(c), input));
  })
  .delete("/:id{[0-9]+}", async (c) => {
    await deleteTask(createDb(c.env.DB), c.get("admin"), parseId(c));
    return ok(c, null);
  })
  .post("/:id{[0-9]+}/status", async (c) => {
    const input = await parseJson(c, taskStatusSchema);
    return ok(c, await changeTaskStatus(createDb(c.env.DB), c.get("admin"), parseId(c), input));
  })
  .post("/:id{[0-9]+}/cancel-request", async (c) => {
    const { reason } = await parseJson(c, cancelRequestSchema);
    return ok(c, await requestTaskCancel(createDb(c.env.DB), c.get("admin"), parseId(c), reason));
  })
  .post("/:id{[0-9]+}/cancel-request/reject", async (c) =>
    ok(c, await rejectTaskCancel(createDb(c.env.DB), c.get("admin"), parseId(c))),
  );

const pepper = (env: AppEnv["Bindings"]) => {
  if (!env.PASSWORD_PEPPER) throw new Error("PASSWORD_PEPPER secret is not configured");
  return env.PASSWORD_PEPPER;
};

/**
 * Nhóm làm việc (module "teams": Quản trị và Quản lý). Quản lý chỉ thấy nhóm mình và chỉ dùng được
 * PUT /:id/members; tạo / sửa / xoá nhóm chỉ Quản trị (services/teams.ts chặn theo vai trò).
 */
export const teamRoutes = new Hono<AppEnv>()
  .get("/", async (c) => ok(c, await listTeams(createDb(c.env.DB), c.get("admin"))))
  .get("/candidates", async (c) => ok(c, await listTeamCandidates(createDb(c.env.DB))))
  .post("/", async (c) => {
    const input = await parseJson(c, teamSchema);
    return ok(c, await createTeam(createDb(c.env.DB), c.get("admin"), input, pepper(c.env)), 201);
  })
  .put("/:id{[0-9]+}", async (c) => {
    const input = await parseJson(c, teamSchema);
    return ok(c, await updateTeam(createDb(c.env.DB), c.get("admin"), parseId(c), input, pepper(c.env)));
  })
  .put("/:id{[0-9]+}/members", async (c) => {
    const input = await parseJson(c, teamMembersSchema);
    return ok(c, await updateTeamMembers(createDb(c.env.DB), c.get("admin"), parseId(c), input));
  })
  .delete("/:id{[0-9]+}", async (c) => {
    await deleteTeam(createDb(c.env.DB), c.get("admin"), parseId(c));
    return ok(c, null);
  });
