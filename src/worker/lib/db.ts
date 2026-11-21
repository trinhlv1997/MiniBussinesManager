import { type SQL, type SQLWrapper, like, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { SQLiteSyncDialect, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Paginated } from "@shared/api";
import { toSearchText } from "@shared/text";
import type { Db } from "../../db/client";
import { auditLogs } from "../../db/schema";
import { ApiError } from "./errors";

/** D1 runs a batch as one transaction: every statement applies, or none do. */
export function runBatch(db: Db, queries: BatchItem<"sqlite">[]): Promise<unknown[]> {
  return db.batch(queries as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

const dialect = new SQLiteSyncDialect();

export type RawQuery<T> = D1PreparedStatement & { __row?: T };

/** Hand-written aggregate SQL; values stay bound parameters. */
export function rawQuery<T>(db: Db, query: SQL): RawQuery<T> {
  const { sql: text, params } = dialect.sqlToQuery(query);
  return db.$client.prepare(text).bind(...params);
}

/** Runs read queries in one round trip. Drizzle's batch cannot carry raw SQL. */
export async function readBatch(db: Db, queries: D1PreparedStatement[]): Promise<unknown[][]> {
  const results = await db.$client.batch(queries);
  return results.map((result) => result.results);
}

/** The id of the row inserted by the previous statement of the same batch. */
export const LAST_INSERT_ID = sql<string>`CAST(last_insert_rowid() AS TEXT)`;

export function auditQuery(
  db: Db,
  actorId: number,
  action: string,
  entityType: string,
  entityId: string | SQL<string>,
  metadata?: Record<string, unknown>,
) {
  return db.insert(auditLogs).values({
    actorId,
    action,
    entityType,
    entityId,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

/** Drizzle wraps driver failures, so the SQLite message may sit on a nested cause. */
export function dbErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

export function matchSearch(column: SQLiteColumn | SQLWrapper, term: string) {
  const escaped = toSearchText(term).replace(/[\\%_]/g, "\\$&");
  return sql`${like(column as SQLiteColumn, `%${escaped}%`)} ESCAPE '\\'`;
}

export const pageOffset = (query: { page: number; pageSize: number }) =>
  (query.page - 1) * query.pageSize;

export function toPage<T>(
  items: T[],
  total: number,
  query: { page: number; pageSize: number },
): Paginated<T> {
  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export const notFound = (message = "Không tìm thấy dữ liệu") =>
  new ApiError(404, "NOT_FOUND", message);

export const duplicate = (field: string, message: string) =>
  new ApiError(409, "DUPLICATE", message, { [field]: message });

export async function nextCode(db: Db, table: "employees" | "customers" | "products" | "product_categories", prefix: string) {
  const rows = await db.all<{ next: number }>(
    sql`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM ${sql.identifier(table)}`,
  );
  return `${prefix}${String(rows[0]?.next ?? 1).padStart(4, "0")}`;
}

export function omit<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...source };
  for (const key of keys) delete copy[key];
  return copy;
}
