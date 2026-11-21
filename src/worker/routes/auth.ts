import { Hono } from "hono";
import { changePasswordSchema, loginSchema } from "@shared/validation/auth";
import { createDb } from "../../db/client";
import type { AppEnv } from "../env";
import { ApiError } from "../lib/errors";
import { ok, parseJson } from "../lib/http";
import { clearSessionCookie, writeSessionCookie } from "../lib/session-cookie";
import { changePassword, login, logout } from "../services/auth";

function pepperOf(env: AppEnv["Bindings"]): string {
  if (!env.PASSWORD_PEPPER) {
    throw new Error("PASSWORD_PEPPER secret is not configured");
  }
  return env.PASSWORD_PEPPER;
}

export const authRoutes = new Hono<AppEnv>()
  .post("/login", async (c) => {
    const input = await parseJson(c, loginSchema);
    const clientIp = c.req.header("cf-connecting-ip") ?? "local";
    const { token, admin } = await login(
      createDb(c.env.DB),
      pepperOf(c.env),
      input,
      clientIp,
    );
    writeSessionCookie(c, token);
    return ok(c, { admin });
  })
  .post("/logout", async (c) => {
    await logout(createDb(c.env.DB), c.get("sessionId"), c.get("admin").id);
    clearSessionCookie(c);
    return ok(c, null);
  })
  .get("/me", (c) => ok(c, { admin: c.get("admin") }))
  .post("/change-password", async (c) => {
    const input = await parseJson(c, changePasswordSchema);
    const { token } = await changePassword(
      createDb(c.env.DB),
      pepperOf(c.env),
      c.get("admin").id,
      input,
    );
    writeSessionCookie(c, token);
    return ok(c, null);
  })
  .all("*", () => {
    throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tài nguyên");
  });
