import { and, asc, count, desc, eq, getTableColumns, gte, isNull, lt, or, sql } from "drizzle-orm";
import { formatDateTime, vnDayEndUtc, vnDayStartUtc } from "@shared/format";
import { CUSTOMER_TIER_LABELS, CUSTOMER_TYPE_LABELS } from "@shared/labels";
import { canAssignTier, seesAllCustomers } from "@shared/permissions";
import { toSearchText } from "@shared/text";
import type { Customer, CustomerDetail, CustomerNote } from "@shared/types";
import type { CustomerInput, CustomerListQuery } from "@shared/validation/entities";
import type { Db } from "../../db/client";
import type { Actor } from "../env";
import { customerNotes, customers, employees } from "../../db/schema";
import { ApiError } from "../lib/errors";
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

const tableColumns = omit(getTableColumns(customers), ["searchText", "deletedAt"]);
/**
 * Customer columns plus the care employee's code and name (left join, deleted employees hidden).
 * The joined columns need their own aliases: D1 returns rows keyed by column name, so a bare
 * `employees.code` would overwrite `customers.code` in the result.
 */
const columns = {
  ...tableColumns,
  careEmployeeCode: sql<string | null>`${employees.code}`.as("care_employee_code"),
  careEmployeeName: sql<string | null>`${employees.fullName}`.as("care_employee_name"),
};
const careEmployeeJoin = and(eq(employees.id, customers.careEmployeeId), isNull(employees.deletedAt));
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

async function assertCareEmployee(db: Db, employeeId: number | null) {
  if (employeeId === null) return;
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), isNull(employees.deletedAt)))
    .limit(1);
  if (!row) {
    const message = "Nhân viên không tồn tại hoặc đã bị xóa";
    throw new ApiError(422, "VALIDATION_ERROR", message, { careEmployeeId: message });
  }
}

function rethrow(error: unknown): never {
  if (dbErrorText(error).includes("UNIQUE constraint failed")) {
    throw duplicate("code", "Mã khách hàng đã tồn tại");
  }
  throw error;
}

/**
 * Phạm vi khách hàng theo vai trò (shared/permissions.ts): Admin thấy tất cả; Employee chỉ thấy khách
 * được phân công cho hồ sơ nhân viên của mình hoặc khách do chính mình tạo. Khách ngoài phạm vi được
 * xử lý như không tồn tại (404), để không lộ là có khách đó.
 */
function visibleTo(actor: Actor) {
  if (seesAllCustomers(actor.role)) return undefined;
  return or(
    eq(customers.createdBy, actor.id),
    actor.employeeId ? eq(customers.careEmployeeId, actor.employeeId) : undefined,
  );
}

export async function listCustomers(db: Db, query: CustomerListQuery, actor: Actor) {
  const where = and(
    isNull(customers.deletedAt),
    visibleTo(actor),
    query.type ? eq(customers.type, query.type) : undefined,
    query.tier ? eq(customers.tier, query.tier) : undefined,
    query.careEmployeeId ? eq(customers.careEmployeeId, query.careEmployeeId) : undefined,
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
      .leftJoin(employees, careEmployeeJoin)
      .where(where)
      .orderBy(direction(SORT_COLUMNS[query.sort]), desc(customers.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
  ]);
  return toPage<Customer>(items, totals[0]?.total ?? 0, query);
}

const visibleRow = (id: number, actor: Actor) => and(live(id), visibleTo(actor));

async function findCustomer(db: Db, id: number, actor: Actor): Promise<Customer> {
  const [row] = await db.select(columns).from(customers).leftJoin(employees, careEmployeeJoin).where(visibleRow(id, actor)).limit(1);
  if (!row) throw notFound("Không tìm thấy khách hàng");
  return row;
}

/** Khách hàng có trong phạm vi của người thao tác không (dùng khi lập phiếu xuất). */
export async function isCustomerVisible(db: Db, id: number, actor: Actor): Promise<boolean> {
  const [row] = await db.select({ id: customers.id }).from(customers).where(visibleRow(id, actor)).limit(1);
  return Boolean(row);
}

export async function getCustomer(db: Db, id: number, actor: Actor): Promise<CustomerDetail> {
  const [rows, notes] = await db.batch([
    db.select(columns).from(customers).leftJoin(employees, careEmployeeJoin).where(visibleRow(id, actor)).limit(1),
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

/**
 * Employee không chọn người chăm sóc: khách mới tự giao cho hồ sơ nhân viên của chính họ,
 * và khi sửa thì giữ nguyên người chăm sóc hiện tại (chỉ Admin mới phân công lại).
 */
function careEmployeeFor(actor: Actor, input: CustomerInput, existing?: Customer): number | null {
  if (seesAllCustomers(actor.role)) return input.careEmployeeId;
  return existing ? existing.careEmployeeId : actor.employeeId;
}

/**
 * Chỉ Quản trị và Quản lý được thêm khách VIP, nâng khách lên VIP hoặc đổi hạng của khách đang là VIP.
 * Báo lỗi rõ ràng thay vì tự đổi giá trị, để người dùng biết vì sao.
 */
function assertTierAllowed(actor: Actor, tier: CustomerInput["tier"], existing?: Customer) {
  if (existing && existing.tier === tier) return;
  const blocked = !canAssignTier(actor.role, tier) || (existing && !canAssignTier(actor.role, existing.tier));
  if (!blocked) return;
  const message = existing && !canAssignTier(actor.role, existing.tier)
    ? "Chỉ Quản lý hoặc Quản trị viên mới được thay đổi hạng của khách hàng VIP"
    : "Chỉ Quản lý hoặc Quản trị viên mới được thêm hoặc nâng khách hàng lên hạng VIP";
  throw new ApiError(403, "FORBIDDEN", message, { tier: message });
}

export async function createCustomer(db: Db, actor: Actor, input: CustomerInput) {
  assertTierAllowed(actor, input.tier);
  const careEmployeeId = careEmployeeFor(actor, input);
  await assertCareEmployee(db, careEmployeeId);
  const code = input.code ?? (await nextCode(db, "customers", "KH"));
  try {
    const [rows] = (await runBatch(db, [
      db
        .insert(customers)
        .values({ ...input, careEmployeeId, code, searchText: searchTextOf(input, code), createdBy: actor.id, updatedBy: actor.id })
        .returning({ id: customers.id }),
      auditQuery(db, actor.id, "customer.create", "customer", LAST_INSERT_ID, { code }),
    ])) as [{ id: number }[]];
    return await findCustomer(db, rows[0]!.id, actor);
  } catch (error) {
    rethrow(error);
  }
}

export async function updateCustomer(db: Db, actor: Actor, id: number, input: CustomerInput) {
  const existing = await findCustomer(db, id, actor);
  assertTierAllowed(actor, input.tier, existing);
  const careEmployeeId = careEmployeeFor(actor, input, existing);
  await assertCareEmployee(db, careEmployeeId);
  const code = input.code ?? existing.code;
  try {
    await runBatch(db, [
      db
        .update(customers)
        .set({ ...input, careEmployeeId, code, searchText: searchTextOf(input, code), updatedBy: actor.id })
        .where(live(id)),
      auditQuery(db, actor.id, "customer.update", "customer", String(id), { code }),
    ]);
    // Admin có thể đã giao khách cho người khác: đọc lại không theo phạm vi để vẫn trả kết quả.
    return await findCustomer(db, id, { ...actor, role: "admin" });
  } catch (error) {
    rethrow(error);
  }
}

export async function deleteCustomer(db: Db, actor: Actor, id: number) {
  const existing = await findCustomer(db, id, actor);
  await runBatch(db, [
    db.update(customers).set({ deletedAt: new Date().toISOString(), updatedBy: actor.id }).where(live(id)),
    auditQuery(db, actor.id, "customer.delete", "customer", String(id), { code: existing.code }),
  ]);
}

export async function addCustomerNote(
  db: Db,
  actor: Actor,
  customerId: number,
  content: string,
): Promise<CustomerNote | undefined> {
  const customer = await findCustomer(db, customerId, actor);
  const [rows] = (await runBatch(db, [
    db.insert(customerNotes).values({ customerId, content, createdBy: actor.id }).returning(noteColumns),
    auditQuery(db, actor.id, "customer.note_add", "customer", String(customerId), { code: customer.code }),
  ])) as [CustomerNote[]];
  return rows[0];
}

export async function deleteCustomerNote(db: Db, actor: Actor, customerId: number, noteId: number) {
  const customer = await findCustomer(db, customerId, actor);
  const where = and(eq(customerNotes.id, noteId), eq(customerNotes.customerId, customerId));
  const [note] = await db.select({ id: customerNotes.id }).from(customerNotes).where(where).limit(1);
  if (!note) throw notFound("Không tìm thấy ghi chú");
  await runBatch(db, [
    db.delete(customerNotes).where(where),
    auditQuery(db, actor.id, "customer.note_delete", "customer", String(customerId), { code: customer.code }),
  ]);
}

export const CUSTOMER_EXPORT: ExportColumn<Customer>[] = [
  { header: "Mã khách hàng", value: (row) => row.code },
  { header: "Tên khách hàng", value: (row) => row.name },
  { header: "Loại khách hàng", value: (row) => CUSTOMER_TYPE_LABELS[row.type] },
  { header: "Hạng khách hàng", value: (row) => CUSTOMER_TIER_LABELS[row.tier] },
  {
    header: "Nhân viên chăm sóc",
    value: (row) => (row.careEmployeeCode ? `${row.careEmployeeCode} · ${row.careEmployeeName}` : null),
  },
  { header: "Người liên hệ", value: (row) => row.contactName },
  { header: "Số điện thoại", value: (row) => row.phone },
  { header: "Email", value: (row) => row.email },
  { header: "Địa chỉ", value: (row) => row.address },
  { header: "Mã số thuế", value: (row) => row.taxCode },
  { header: "Ghi chú", value: (row) => row.note },
  { header: "Ngày tạo", value: (row) => formatDateTime(row.createdAt) },
];
