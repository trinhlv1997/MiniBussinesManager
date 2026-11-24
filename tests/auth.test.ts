import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/worker/lib/password";
import { ADMIN, api, createAdmin, loginAsAdmin, sessionCookie, testEnv } from "./helpers";

const NEW_PASSWORD = "mat-khau-moi-an-toan-02";
const changeBody = (currentPassword = ADMIN.password, newPassword = NEW_PASSWORD) => ({
  currentPassword,
  newPassword,
  confirmPassword: newPassword,
});

beforeEach(() => createAdmin());

describe("password hashing", () => {
  it("uses a unique salt and depends on the pepper", async () => {
    const first = await hashPassword("mat-khau", "pepper-a");
    const second = await hashPassword("mat-khau", "pepper-a");
    expect(first).not.toBe(second);
    expect(first).not.toContain("mat-khau");
    expect((await verifyPassword("mat-khau", first, "pepper-a")).valid).toBe(true);
    expect((await verifyPassword("sai", first, "pepper-a")).valid).toBe(false);
    expect((await verifyPassword("mat-khau", first, "pepper-b")).valid).toBe(false);
  });
});

describe("login", () => {
  it("creates a session with a protected cookie and stores only a token hash", async () => {
    const response = await api("/api/auth/login", { body: ADMIN });
    expect(response.status).toBe(200);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Strict/i);

    const body = await response.json<{ data: { admin: Record<string, unknown> } }>();
    expect(body.data.admin).toEqual({ id: 1, username: "admin", displayName: "Quản trị viên", role: "admin", employeeId: null });

    const token = sessionCookie(response).split("=")[1];
    const row = await env.DB.prepare("SELECT id FROM admin_sessions").first<{ id: string }>();
    expect(row?.id).toBeTruthy();
    expect(row?.id).not.toBe(token);
  });

  it("marks the cookie Secure with the __Host- prefix in production", async () => {
    const response = await api("/api/auth/login", { body: ADMIN }, {
      ...testEnv,
      APP_ENV: "production",
    });
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^__Host-mbm_session=/);
    expect(header).toMatch(/Secure/i);
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    const wrong = await api("/api/auth/login", { body: { ...ADMIN, password: "sai-mat-khau" } });
    const unknown = await api("/api/auth/login", {
      body: { username: "khong-ton-tai", password: "sai-mat-khau" },
      ip: "10.0.0.2",
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("validates input and returns Vietnamese field errors", async () => {
    const response = await api("/api/auth/login", { body: { username: "", password: "" } });
    expect(response.status).toBe(422);
    const body = await response.json<{ error: { fields: Record<string, string> } }>();
    expect(body.error.fields.username).toBe("Vui lòng nhập tên đăng nhập");
  });

  it("blocks an IP after repeated attempts, even with the right password", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api("/api/auth/login", {
        body: { ...ADMIN, password: "sai-mat-khau" },
        ip: "10.0.0.9",
      });
      expect(response.status).toBe(401);
    }
    const blocked = await api("/api/auth/login", { body: ADMIN, ip: "10.0.0.9" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    const otherIp = await api("/api/auth/login", { body: ADMIN, ip: "10.0.0.10" });
    expect(otherIp.status).toBe(200);
  });

  it("does not let parallel attempts exceed the limit", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        api("/api/auth/login", { body: { ...ADMIN, password: "sai" }, ip: "10.0.0.11" }),
      ),
    );
    expect(responses.filter((response) => response.status === 401)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(3);
  });
});

describe("access control", () => {
  it("rejects protected and unknown API routes without a session", async () => {
    for (const path of ["/api/auth/me", "/api/employees", "/api/khong-ton-tai"]) {
      expect((await api(path)).status).toBe(401);
    }
    expect((await api("/api/auth/me", { cookie: "mbm_session=gia-mao" })).status).toBe(401);
  });

  it("keeps the health check public and marks API responses uncacheable", async () => {
    const response = await api("/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns the profile without sensitive fields", async () => {
    const response = await api("/api/auth/me", { cookie: await loginAsAdmin() });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("pbkdf2");
  });

  it("rejects expired sessions", async () => {
    const cookie = await loginAsAdmin();
    await env.DB.prepare("UPDATE admin_sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await api("/api/auth/me", { cookie })).status).toBe(401);
  });

  it("rejects state changes from another or a missing origin", async () => {
    const cookie = await loginAsAdmin();
    const foreign = await api("/api/auth/logout", {
      method: "POST",
      cookie,
      origin: "https://ke-gian.example",
    });
    const missing = await api("/api/auth/logout", { method: "POST", cookie, origin: null });
    expect(foreign.status).toBe(403);
    expect(missing.status).toBe(403);
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });

  it("requires a JSON content type", async () => {
    const { app } = await import("../src/worker/app");
    const response = await app.request(
      "http://localhost/api/auth/login",
      {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "text/plain" },
        body: JSON.stringify(ADMIN),
      },
      testEnv,
    );
    expect(response.status).toBe(415);
  });
});

describe("logout", () => {
  it("revokes the session on the server", async () => {
    const cookie = await loginAsAdmin();
    const response = await api("/api/auth/logout", { method: "POST", cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect((await api("/api/auth/me", { cookie })).status).toBe(401);
  });
});

describe("change password", () => {
  it("replaces the password and revokes every older session", async () => {
    const oldDevice = await loginAsAdmin();
    const current = await loginAsAdmin();
    const response = await api("/api/auth/change-password", {
      cookie: current,
      body: changeBody(),
    });
    expect(response.status).toBe(200);

    expect((await api("/api/auth/me", { cookie: oldDevice })).status).toBe(401);
    expect((await api("/api/auth/me", { cookie: current })).status).toBe(401);
    expect((await api("/api/auth/me", { cookie: sessionCookie(response) })).status).toBe(200);

    expect((await api("/api/auth/login", { body: ADMIN })).status).toBe(401);
    const relogin = await api("/api/auth/login", {
      body: { username: ADMIN.username, password: NEW_PASSWORD },
      ip: "10.0.0.20",
    });
    expect(relogin.status).toBe(200);
  });

  it("rejects a wrong current password and a weak new one", async () => {
    const cookie = await loginAsAdmin();
    const wrong = await api("/api/auth/change-password", {
      cookie,
      body: changeBody("sai-mat-khau-hien-tai"),
    });
    expect(wrong.status).toBe(422);

    const weak = await api("/api/auth/change-password", {
      cookie,
      body: changeBody(ADMIN.password, "ngan"),
    });
    expect(weak.status).toBe(422);
    expect((await api("/api/auth/login", { body: ADMIN, ip: "10.0.0.21" })).status).toBe(200);
  });

  it("limits guesses of the current password", async () => {
    const cookie = await loginAsAdmin();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await api("/api/auth/change-password", { cookie, body: changeBody("doan-mat-khau-sai") });
    }
    const blocked = await api("/api/auth/change-password", { cookie, body: changeBody() });
    expect(blocked.status).toBe(429);
  });

  it("never writes secrets to the audit log", async () => {
    const cookie = await loginAsAdmin();
    await api("/api/auth/change-password", { cookie, body: changeBody() });
    const { results } = await env.DB.prepare("SELECT * FROM audit_logs").all();
    const text = JSON.stringify(results);
    expect(text).toContain("auth.password_changed");
    expect(text).not.toContain(NEW_PASSWORD);
    expect(text).not.toContain(ADMIN.password);
  });
});
