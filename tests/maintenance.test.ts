import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { createDb } from "../src/db/client";
import { auditCutoff, runMaintenance } from "../src/worker/services/maintenance";
import { api, createAdmin, loginAsAdmin, testEnv } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-24T05:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

async function auditAt(createdAt: string, action = "customer.update") {
  await env.DB.prepare("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, created_at) VALUES (1, ?, 'customer', '1', ?)")
    .bind(action, createdAt)
    .run();
}
const auditCount = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs").first<{ n: number }>())!.n;

beforeEach(async () => {
  await createAdmin();
});

describe("audit log retention", () => {
  it("keeps the last 30 days and deletes older entries", async () => {
    await auditAt(daysAgo(45));
    await auditAt(daysAgo(31));
    await auditAt(daysAgo(29));
    await auditAt(daysAgo(1));
    const result = await runMaintenance(createDb(env.DB), NOW);
    expect(result.auditLogsDeleted).toBe(2);
    const left = await env.DB.prepare("SELECT created_at FROM audit_logs ORDER BY created_at").all<{ created_at: string }>();
    expect(left.results.map((row) => row.created_at)).toEqual([daysAgo(29), daysAgo(1)]);
    expect(auditCutoff(NOW)).toBe(daysAgo(30));
  });

  it("also removes expired sessions but keeps live ones", async () => {
    await env.DB.prepare("INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ('old', 1, ?), ('live', 1, ?)")
      .bind(daysAgo(1), new Date(NOW.getTime() + DAY).toISOString())
      .run();
    expect((await runMaintenance(createDb(env.DB), NOW)).sessionsDeleted).toBe(1);
    const ids = await env.DB.prepare("SELECT id FROM admin_sessions").all<{ id: string }>();
    expect(ids.results.map((row) => row.id)).toEqual(["live"]);
  });

  it("does not touch who created or last changed a record", async () => {
    const cookie = await loginAsAdmin();
    const response = await api("/api/customers", { body: { name: "Khách cũ", type: "business" }, cookie });
    const { data } = (await response.json()) as { data: { id: number } };
    await env.DB.prepare("UPDATE audit_logs SET created_at = ?").bind(daysAgo(60)).run();
    await runMaintenance(createDb(env.DB), NOW);
    expect(await auditCount()).toBe(0);
    const row = await api(`/api/customers/${data.id}`, { cookie });
    expect(await row.json()).toMatchObject({ data: { createdBy: 1, updatedBy: 1 } });
  });

  it("keeps the last login time after its audit entry is deleted", async () => {
    const before = Date.now();
    const cookie = await loginAsAdmin();
    await env.DB.prepare("DELETE FROM audit_logs").run();
    const users = await api("/api/users", { cookie });
    const [admin] = ((await users.json()) as { data: { lastLoginAt: string }[] }).data;
    expect(Date.parse(admin!.lastLoginAt)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("runs from the nightly Cron Trigger", async () => {
    await auditAt(daysAgo(90));
    await auditAt(new Date().toISOString());
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
    await worker.scheduled({ cron: "0 19 * * *", scheduledTime: Date.now(), noRetry: () => {} } as ScheduledController, testEnv, ctx);
    await Promise.all(pending);
    expect(await auditCount()).toBe(1);
  });
});
