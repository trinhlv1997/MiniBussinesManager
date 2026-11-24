import { z } from "zod";
import { AUDIT_ENTITY_LABELS } from "../audit";
import { queryDate, queryId } from "./common";

const ENTITY_TYPES = Object.keys(AUDIT_ENTITY_LABELS) as [string, ...string[]];

export const auditListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  actorId: queryId,
  entityType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(ENTITY_TYPES).optional()),
  /** Lịch sử của một bản ghi cụ thể (dùng trong cửa sổ chi tiết). */
  entityId: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d+$/).optional()),
  from: queryDate,
  to: queryDate,
});

export type AuditListQuery = z.output<typeof auditListQuery>;
