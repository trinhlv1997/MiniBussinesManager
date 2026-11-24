import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { formatDateTime, vnDayEndUtc, vnDayStartUtc } from "@shared/format";
import { auditActionLabel, auditEntityLabel } from "@shared/audit";
import type { AuditEntry } from "@shared/types";
import type { AuditListQuery } from "@shared/validation/audit";
import type { Db } from "../../db/client";
import { adminUsers, auditLogs } from "../../db/schema";
import type { ExportColumn } from "../lib/export";
import { pageOffset, toPage } from "../lib/db";

const columns = {
  id: auditLogs.id,
  createdAt: auditLogs.createdAt,
  actorId: auditLogs.actorId,
  actorName: sql<string | null>`${adminUsers.displayName}`.as("actor_name"),
  action: auditLogs.action,
  entityType: auditLogs.entityType,
  entityId: auditLogs.entityId,
  // Mã lưu trong nhật ký nếu có; nếu không thì tra từ bảng gốc (cũng áp dụng cho nhật ký cũ).
  entityCode: sql<string | null>`COALESCE(
    json_extract(${auditLogs.metadata}, '$.code'),
    CASE ${auditLogs.entityType}
      WHEN 'inventory_transaction' THEN (SELECT code FROM inventory_transactions WHERE id = CAST(${auditLogs.entityId} AS INTEGER))
      WHEN 'customer' THEN (SELECT code FROM customers WHERE id = CAST(${auditLogs.entityId} AS INTEGER))
      WHEN 'employee' THEN (SELECT code FROM employees WHERE id = CAST(${auditLogs.entityId} AS INTEGER))
      WHEN 'product' THEN (SELECT sku FROM products WHERE id = CAST(${auditLogs.entityId} AS INTEGER))
      WHEN 'product_category' THEN (SELECT code FROM product_categories WHERE id = CAST(${auditLogs.entityId} AS INTEGER))
      WHEN 'admin_user' THEN (SELECT username FROM admin_users WHERE id = CAST(${auditLogs.entityId} AS INTEGER))
    END
  )`.as("entity_code"),
};

export async function listAuditLogs(db: Db, query: AuditListQuery) {
  const where = and(
    query.actorId ? eq(auditLogs.actorId, query.actorId) : undefined,
    query.entityType ? eq(auditLogs.entityType, query.entityType) : undefined,
    query.entityId ? eq(auditLogs.entityId, query.entityId) : undefined,
    query.from ? gte(auditLogs.createdAt, vnDayStartUtc(query.from)) : undefined,
    query.to ? lt(auditLogs.createdAt, vnDayEndUtc(query.to)) : undefined,
  );
  const [totals, items] = await db.batch([
    db.select({ total: count() }).from(auditLogs).where(where),
    db
      .select(columns)
      .from(auditLogs)
      .leftJoin(adminUsers, eq(adminUsers.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
  ]);
  return toPage<AuditEntry>(items, totals[0]?.total ?? 0, query);
}

export const AUDIT_EXPORT: ExportColumn<AuditEntry>[] = [
  { header: "Thời gian", value: (row) => formatDateTime(row.createdAt) },
  { header: "Người thực hiện", value: (row) => row.actorName },
  { header: "Thao tác", value: (row) => auditActionLabel(row.action) },
  { header: "Đối tượng", value: (row) => auditEntityLabel(row.entityType) },
  { header: "Mã", value: (row) => row.entityCode ?? row.entityId },
];
