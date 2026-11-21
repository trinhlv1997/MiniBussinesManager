import { env } from "cloudflare:workers";
import { app } from "../src/worker/app";
import type { Bindings } from "../src/worker/env";
import { hashPassword } from "../src/worker/lib/password";

export const ORIGIN = "http://localhost";
export const ADMIN = { username: "admin", password: "mat-khau-kiem-thu-01" };
export const testEnv = env as unknown as Bindings;

export async function createAdmin(password = ADMIN.password) {
  const hash = await hashPassword(password, testEnv.PASSWORD_PEPPER);
  await env.DB.prepare(
    "INSERT INTO admin_users (id, username, display_name, password_hash) VALUES (1, ?, ?, ?)",
  )
    .bind(ADMIN.username, "Quản trị viên", hash)
    .run();
}

export function api(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; ip?: string; origin?: string | null } = {},
  bindings: Bindings = testEnv,
) {
  const headers = new Headers();
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.ip) headers.set("cf-connecting-ip", options.ip);
  if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);

  return app.request(
    `${ORIGIN}${path}`,
    {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    bindings,
  );
}

export function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";")[0] ?? "";
}

export async function loginAsAdmin(): Promise<string> {
  const response = await api("/api/auth/login", { body: ADMIN });
  if (response.status !== 200) throw new Error(`login failed: ${response.status}`);
  return sessionCookie(response);
}
