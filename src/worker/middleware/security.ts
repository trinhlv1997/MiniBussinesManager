import { createMiddleware } from "hono/factory";
import { canAccess, type Module } from "@shared/permissions";
import { createDb } from "../../db/client";
import type { AppEnv } from "../env";
import { ApiError } from "../lib/errors";
import { clearSessionCookie, readSessionCookie } from "../lib/session-cookie";
import { findSession } from "../services/auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PUBLIC_ROUTES = new Set(["GET /api/health", "POST /api/auth/login"]);

export const apiHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
});

/**
 * CSRF defence alongside the SameSite=Strict cookie: state-changing requests must
 * prove they come from this origin. Requests without an Origin header are rejected.
 */
export const requireSameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin !== new URL(c.req.url).origin) {
      throw new ApiError(403, "CSRF_REJECTED", "Yêu cầu không hợp lệ");
    }
  }
  await next();
});

/** Every API route requires a session unless it is listed in PUBLIC_ROUTES. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`)) return next();

  const token = readSessionCookie(c);
  const session = token ? await findSession(createDb(c.env.DB), token) : null;
  if (!session) {
    if (token) clearSessionCookie(c);
    throw new ApiError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập");
  }

  c.set("admin", session.admin);
  c.set("sessionId", session.sessionId);
  await next();
});

/** Chặn API của một chức năng khi vai trò của tài khoản không được phép (xem shared/permissions.ts). */
export const requireModule = (module: Module) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!canAccess(c.get("admin").role, module)) {
      throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền sử dụng chức năng này");
    }
    await next();
  });
