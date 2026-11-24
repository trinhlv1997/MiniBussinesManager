import { and, asc, count, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import { formatDate } from "@shared/format";
import { EMPLOYEE_STATUS_LABELS } from "@shared/labels";
import { toSearchText } from "@shared/text";
import type { Employee, EmployeeDetail } from "@shared/types";
import type { EmployeeInput, EmployeeListQuery } from "@shared/validation/entities";
import type { Db } from "../../db/client";
import type { Actor } from "../env";
import { customers, employees } from "../../db/schema";
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

const detailColumns = omit(getTableColumns(employees), ["searchText", "deletedAt"]);
const listColumns = omit(detailColumns, ["avatar"]);
const live = (id: number) => and(eq(employees.id, id), isNull(employees.deletedAt));

const SORT_COLUMNS = {
  code: employees.code,
  fullName: employees.fullName,
  hireDate: employees.hireDate,
  status: employees.status,
  baseSalary: employees.baseSalary,
  createdAt: employees.createdAt,
};

const searchTextOf = (input: EmployeeInput, code: string) =>
  toSearchText(code, input.fullName, input.phone, input.email, input.position, input.address);

function rethrow(error: unknown): never {
  if (dbErrorText(error).includes("UNIQUE constraint failed")) {
    throw duplicate("code", "Mã nhân viên đã tồn tại");
  }
  throw error;
}

export async function listEmployees(db: Db, query: EmployeeListQuery) {
  const where = and(
    isNull(employees.deletedAt),
    query.status ? eq(employees.status, query.status) : undefined,
    query.search ? matchSearch(employees.searchText, query.search) : undefined,
  );
  const direction = query.dir === "asc" ? asc : desc;
  const [totals, items] = await db.batch([
    db.select({ total: count() }).from(employees).where(where),
    db
      .select(listColumns)
      .from(employees)
      .where(where)
      .orderBy(direction(SORT_COLUMNS[query.sort]), desc(employees.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
  ]);
  return toPage<Employee>(items, totals[0]?.total ?? 0, query);
}

export async function getEmployee(db: Db, id: number): Promise<EmployeeDetail> {
  const [row] = await db.select(detailColumns).from(employees).where(live(id)).limit(1);
  if (!row) throw notFound("Không tìm thấy nhân viên");
  return row;
}

export async function createEmployee(db: Db, actor: Actor, input: EmployeeInput) {
  const code = input.code ?? (await nextCode(db, "employees", "NV"));
  try {
    const [rows] = (await runBatch(db, [
      db
        .insert(employees)
        .values({ ...input, code, searchText: searchTextOf(input, code), createdBy: actor.id, updatedBy: actor.id })
        .returning(detailColumns),
      auditQuery(db, actor.id, "employee.create", "employee", LAST_INSERT_ID, { code }),
    ])) as [EmployeeDetail[]];
    return rows[0];
  } catch (error) {
    rethrow(error);
  }
}

export async function updateEmployee(db: Db, actor: Actor, id: number, input: EmployeeInput) {
  const existing = await getEmployee(db, id);
  const code = input.code ?? existing.code;
  try {
    const [rows] = (await runBatch(db, [
      db
        .update(employees)
        .set({ ...input, code, searchText: searchTextOf(input, code), updatedBy: actor.id })
        .where(live(id))
        .returning(detailColumns),
      auditQuery(db, actor.id, "employee.update", "employee", String(id), { code }),
    ])) as [EmployeeDetail[]];
    return rows[0];
  } catch (error) {
    rethrow(error);
  }
}

export async function deleteEmployee(db: Db, actor: Actor, id: number) {
  const existing = await getEmployee(db, id);
  await runBatch(db, [
    db.update(employees).set({ deletedAt: new Date().toISOString(), updatedBy: actor.id }).where(live(id)),
    // Nhân viên bị xoá (mềm) thì khách hàng họ chăm sóc trở về "chưa phân công".
    db.update(customers).set({ careEmployeeId: null }).where(eq(customers.careEmployeeId, id)),
    auditQuery(db, actor.id, "employee.delete", "employee", String(id), { code: existing.code }),
  ]);
}

export const EMPLOYEE_EXPORT: ExportColumn<Employee>[] = [
  { header: "Mã nhân viên", value: (row) => row.code },
  { header: "Họ và tên", value: (row) => row.fullName },
  { header: "Số điện thoại", value: (row) => row.phone },
  { header: "Email", value: (row) => row.email },
  { header: "Chức vụ", value: (row) => row.position },
  { header: "Ngày vào làm", value: (row) => formatDate(row.hireDate) },
  { header: "Trạng thái", value: (row) => EMPLOYEE_STATUS_LABELS[row.status] },
  { header: "Địa chỉ", value: (row) => row.address },
  // Số nguyên VND (không định dạng) để bảng tính cộng trừ được.
  { header: "Lương cơ bản (VND)", value: (row) => row.baseSalary },
  { header: "Ghi chú", value: (row) => row.note },
];
