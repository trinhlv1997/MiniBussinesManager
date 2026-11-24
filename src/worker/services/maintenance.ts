import { lt, lte } from "drizzle-orm";
import { AUDIT_RETENTION_DAYS } from "@shared/audit";
import type { Db } from "../../db/client";
import { adminSessions, auditLogs } from "../../db/schema";
import { deleteExpiredAttemptsQuery } from "./rate-limit";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mốc thời gian: nhật ký trước mốc này bị xoá (giữ AUDIT_RETENTION_DAYS ngày gần nhất). */
export const auditCutoff = (now = new Date()) => new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY_MS).toISOString();

/**
 * Dọn dẹp hằng đêm (Cron Trigger trong wrangler.jsonc): nhật ký cũ hơn 30 ngày, phiên đăng nhập
 * hết hạn và bộ đếm chống dò mật khẩu đã quá hạn. Một batch, vài câu lệnh có chỉ mục: nhẹ cho gói Free.
 */
export async function runMaintenance(db: Db, now = new Date()) {
  const [audit, sessions] = await db.batch([
    db.delete(auditLogs).where(lt(auditLogs.createdAt, auditCutoff(now))),
    db.delete(adminSessions).where(lte(adminSessions.expiresAt, now.toISOString())),
    deleteExpiredAttemptsQuery(db),
  ]);
  return { auditLogsDeleted: audit.meta.changes ?? 0, sessionsDeleted: sessions.meta.changes ?? 0 };
}
