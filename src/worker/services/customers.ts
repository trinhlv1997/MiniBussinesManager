import { and, asc, count, desc, eq, getTableColumns, gte, isNull, lt } from "drizzle-orm";
import { formatDateTime, vnDayEndUtc, vnDayStartUtc } from "@shared/format";
import { CUSTOMER_TIER_LABELS, CUSTOMER_TYPE_LABELS } from "@shared/labels";
import { toSearchText } from "@shared/text";
import type { Customer, CustomerDetail, CustomerNote } from "@shared/types";
import type { CustomerInput, CustomerListQuery } from "@shared/validation/entities";
import type { Db } from "../../db/client";
import { customerNotes, customers } from "../../db/schema";
import type { ExportColumn } from "../lib/export";
import {
  LAST_INSERT_ID,
  auditQuery,
  dbErrorText,
  duplicate,
  matchSearch,
  nextCode,
  notFound,
  omit,
  pageOffset,
  runBatch,
  toPage,
} from "../lib/db";

const columns = omit(getTableColumns(customers), ["searchText", "deletedAt"]);
const noteColumns = {
  id: customerNotes.id,
  content: customerNotes.content,
  createdAt: customerNotes.createdAt,
};
const live = (id: number) => and(eq(customers.id, id), isNull(customers.deletedAt));

const SORT_COLUMNS = {
  code: customers.code,
  name: customers.name,
  type: customers.type,
  tier: customers.tier,
  createdAt: customers.createdAt,
};

const searchTextOf = (input: CustomerInput, code: string) =>
  toSearchText(code, input.name, input.contactName, input.phone, input.email, input.taxCode, input.address);

function rethrow(error: unknown): never {
  if (dbErrorText(error).includes("UNIQUE constraint failed")) {
    throw duplicate("code", "Mã khách hàng đã tồn tại");
  }
  throw error;
}

export async function listCustomers(db: Db, query: CustomerListQuery) {
  const where = and(
    isNull(customers.deletedAt),
    query.type ? eq(customers.type, query.type) : undefined,
    query.tier ? eq(customers.tier, query.tier) : undefined,
    query.search ? matchSearch(customers.searchText, query.search) : undefined,
    query.createdFrom ? gte(customers.createdAt, vnDayStartUtc(query.createdFrom)) : undefined,
    query.createdTo ? lt(customers.createdAt, vnDayEndUtc(query.createdTo)) : undefined,
  );
  const direction = query.dir === "asc" ? asc : desc;
  const [totals, items] = await db.batch([
    db.select({ total: count() }).from(customers).where(where),
    db
      .select(columns)
      .from(customers)
      .where(where)
      .orderBy(direction(SORT_COLUMNS[query.sort]), desc(customers.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
  ]);
  return toPage<Customer>(items, totals[0]?.total ?? 0, query);
}

async function findCustomer(db: Db, id: number): Promise<Customer> {
  const [row] = await db.select(columns).from(customers).where(live(id)).limit(1);
  if (!row) throw notFound("Không tìm thấy khách hàng");
  return row;
}

export async function getCustomer(db: Db, id: number): Promise<CustomerDetail> {
  const [rows, notes] = await db.batch([
    db.select(columns).from(customers).where(live(id)).limit(1),
    db
      .select(noteColumns)
      .from(customerNotes)
      .where(eq(customerNotes.customerId, id))
      .orderBy(desc(customerNotes.createdAt), desc(customerNotes.id))
      .limit(100),
  ]);
  const customer = rows[0];
  if (!customer) throw notFound("Không tìm thấy khách hàng");
  return { ...customer, notes };
}

export async function createCustomer(db: Db, actorId: number, input: CustomerInput) {
  const code = input.code ?? (await nextCode(db, "customers", "KH"));
  try {
    const [rows] = (await runBatch(db, [
      db
        .insert(customers)
        .values({ ...input, code, searchText: searchTextOf(input, code) })
        .returning(columns),
      auditQuery(db, actorId, "customer.create", "customer", LAST_INSERT_ID, { code }),
    ])) as [Customer[]];
    return rows[0];
  } catch (error) {
    rethrow(error);
  }
}

export async function updateCustomer(db: Db, actorId: number, id: number, input: CustomerInput) {
  const existing = await findCustomer(db, id);
  const code = input.code ?? existing.code;
  try {
    const [rows] = (await runBatch(db, [
      db
        .update(customers)
        .set({ ...input, code, searchText: searchTextOf(input, code) })
        .where(live(id))
        .returning(columns),
      auditQuery(db, actorId, "customer.update", "customer", String(id), { code }),
    ])) as [Customer[]];
    return rows[0];
  } catch (error) {
    rethrow(error);
  }
}

export async function deleteCustomer(db: Db, actorId: number, id: number) {
  const existing = await findCustomer(db, id);
  await runBatch(db, [
    db.update(customers).set({ deletedAt: new Date().toISOString() }).where(live(id)),
    auditQuery(db, actorId, "customer.delete", "customer", String(id), { code: existing.code }),
  ]);
}

export async function addCustomerNote(
  db: Db,
  actorId: number,
  customerId: number,
  content: string,
): Promise<CustomerNote | undefined> {
  await findCustomer(db, customerId);
  const [rows] = (await runBatch(db, [
    db.insert(customerNotes).values({ customerId, content }).returning(noteColumns),
    auditQuery(db, actorId, "customer.note_add", "customer", String(customerId)),
  ])) as [CustomerNote[]];
  return rows[0];
}

export async function deleteCustomerNote(db: Db, actorId: number, customerId: number, noteId: number) {
  const where = and(eq(customerNotes.id, noteId), eq(customerNotes.customerId, customerId));
  const [note] = await db.select({ id: customerNotes.id }).from(customerNotes).where(where).limit(1);
  if (!note) throw notFound("Không tìm thấy ghi chú");
  await runBatch(db, [
    db.delete(customerNotes).where(where),
    auditQuery(db, actorId, "customer.note_delete", "customer", String(customerId)),
  ]);
}

export const CUSTOMER_EXPORT: ExportColumn<Customer>[] = [
  { header: "Mã khách hàng", value: (row) => row.code },
  { header: "Tên khách hàng", value: (row) => row.name },
  { header: "Loại khách hàng", value: (row) => CUSTOMER_TYPE_LABELS[row.type] },
  { header: "Hạng khách hàng", value: (row) => CUSTOMER_TIER_LABELS[row.tier] },
  { header: "Người liên hệ", value: (row) => row.contactName },
  { header: "Số điện thoại", value: (row) => row.phone },
  { header: "Email", value: (row) => row.email },
  { header: "Địa chỉ", value: (row) => row.address },
  { header: "Mã số thuế", value: (row) => row.taxCode },
  { header: "Ghi chú", value: (row) => row.note },
  { header: "Ngày tạo", value: (row) => formatDateTime(row.createdAt) },
];
