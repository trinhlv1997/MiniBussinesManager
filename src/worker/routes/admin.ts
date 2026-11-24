import { Hono } from "hono";
import { auditListQuery } from "@shared/validation/audit";
import { resetPasswordSchema, userCreateSchema, userUpdateSchema } from "@shared/validation/users";
import { createDb } from "../../db/client";
import type { AppEnv } from "../env";
import { MAX_EXPORT_ROWS, excelResponse } from "../lib/export";
import { ok, parseJson } from "../lib/http";
import { parseId, parseQuery } from "../lib/resource-routes";
import { AUDIT_EXPORT, listAuditLogs } from "../services/audit";
import { createUser, listUserNames, listUsers, resetUserPassword, updateUser } from "../services/users";

const pepper = (env: AppEnv["Bindings"]) => {
  if (!env.PASSWORD_PEPPER) throw new Error("PASSWORD_PEPPER secret is not configured");
  return env.PASSWORD_PEPPER;
};

/** Quản lý tài khoản (chỉ Admin, chặn bằng requireModule("users") ở app.ts). */
export const userRoutes = new Hono<AppEnv>()
  .get("/", async (c) => ok(c, await listUsers(createDb(c.env.DB))))
  .post("/", async (c) => {
    const input = await parseJson(c, userCreateSchema);
    return ok(c, await createUser(createDb(c.env.DB), pepper(c.env), c.get("admin"), input), 201);
  })
  .put("/:id{[0-9]+}", async (c) => {
    const input = await parseJson(c, userUpdateSchema);
    return ok(c, await updateUser(createDb(c.env.DB), c.get("admin"), parseId(c), input));
  })
  .post("/:id{[0-9]+}/reset-password", async (c) => {
    const { password } = await parseJson(c, resetPasswordSchema);
    await resetUserPassword(createDb(c.env.DB), pepper(c.env), c.get("admin"), parseId(c), password);
    return ok(c, null);
  });

/** Tên người dùng cho mọi tài khoản đã đăng nhập (hiển thị "Tạo bởi …"). */
export const userNameRoutes = new Hono<AppEnv>().get("/", async (c) => ok(c, await listUserNames(createDb(c.env.DB))));

/** Nhật ký hoạt động (chỉ Admin). */
export const auditRoutes = new Hono<AppEnv>()
  .get("/", async (c) => ok(c, await listAuditLogs(createDb(c.env.DB), parseQuery(c, auditListQuery))))
  .get("/export", async (c) => {
    const query = { ...parseQuery(c, auditListQuery), page: 1, pageSize: MAX_EXPORT_ROWS };
    const { items, pagination } = await listAuditLogs(createDb(c.env.DB), query);
    return excelResponse(c, {
      fileName: "nhat-ky-hoat-dong",
      sheetName: "Nhật ký hoạt động",
      columns: AUDIT_EXPORT,
      rows: items,
      total: pagination.total,
    });
  });
