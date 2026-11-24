import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { vnToday } from "../src/shared/format";
import { api, createAdmin, loginAsAdmin, sessionCookie } from "./helpers";
import { readXlsx } from "./xlsx-reader";

const PASSWORD = "mat-khau-nhan-vien-01";
type Page<T> = { items: T[]; pagination: { total: number } };

let admin = "";
const as = (cookie: string) => ({
  get: (path: string) => api(path, { cookie }),
  send: (path: string, method: string, body?: unknown) => api(path, { method, body, cookie }),
});
const data = async <T>(response: Response) => ((await response.json()) as { data: T }).data;
const login = async (username: string, password = PASSWORD) => {
  const response = await api("/api/auth/login", { body: { username, password } });
  expect(response.status).toBe(200);
  return sessionCookie(response);
};

/** Admin tạo hồ sơ nhân viên + tài khoản role employee gắn với hồ sơ đó. */
async function employeeAccount(username: string, fullName: string) {
  const staff = await data<{ id: number }>(await as(admin).send("/api/employees", "POST", { fullName, status: "active" }));
  const user = await as(admin).send("/api/users", "POST", { username, displayName: fullName, password: PASSWORD, role: "employee", employeeId: staff.id });
  expect(user.status).toBe(201);
  const account = await data<{ id: number }>(user);
  return { employeeId: staff.id, userId: account.id, cookie: await login(username) };
}

const customer = (name: string, extra: object = {}) => ({ name, type: "business", ...extra });
const createCustomer = async (cookie: string, body: object) => {
  const response = await as(cookie).send("/api/customers", "POST", body);
  expect(response.status).toBe(201);
  return data<{ id: number; code: string; careEmployeeId: number | null; createdBy: number | null; updatedBy: number | null }>(response);
};
const visibleNames = async (cookie: string) =>
  (await data<Page<{ name: string }>>(await as(cookie).get("/api/customers?sort=name&dir=asc"))).items.map((c) => c.name);

beforeEach(async () => {
  await createAdmin();
  admin = await loginAsAdmin();
});

describe("module access by role", () => {
  it("lets an employee use only customers, products and inventory", async () => {
    const { cookie } = await employeeAccount("nv.a", "Nhân viên A");
    const allowed = ["/api/customers", "/api/products", "/api/product-categories", "/api/inventory/transactions", "/api/inventory/balances", "/api/settings", "/api/user-names", "/api/auth/me"];
    for (const path of allowed) expect((await as(cookie).get(path)).status, path).toBe(200);

    const forbidden = ["/api/employees", "/api/employees/export", "/api/dashboard/summary", "/api/reports/customers", "/api/users", "/api/audit-logs"];
    for (const path of forbidden) {
      const response = await as(cookie).get(path);
      expect(response.status, path).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    }
    expect((await as(cookie).send("/api/settings", "PUT", { companyName: "X", appName: "X" })).status).toBe(403);
    expect((await as(cookie).send("/api/employees", "POST", { fullName: "X", status: "active" })).status).toBe(403);
  });

  it("returns the role and linked employee in the session", async () => {
    const { cookie, employeeId } = await employeeAccount("nv.a", "Nhân viên A");
    expect((await data<{ admin: object }>(await as(cookie).get("/api/auth/me"))).admin).toMatchObject({ role: "employee", employeeId });
  });
});

describe("customer visibility for employees", () => {
  it("shows only customers picked for them or created by them", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    const b = await employeeAccount("nv.b", "Nhân viên B");
    await createCustomer(admin, customer("C1 của A", { careEmployeeId: a.employeeId }));
    const c2 = await createCustomer(admin, customer("C2 của B", { careEmployeeId: b.employeeId }));
    await createCustomer(admin, customer("C3 chưa giao"));
    // A tạo khách: tự giao cho A, dù gửi careEmployeeId của B.
    const c4 = await createCustomer(a.cookie, customer("C4 A tạo", { careEmployeeId: b.employeeId }));
    expect(c4).toMatchObject({ careEmployeeId: a.employeeId, createdBy: a.userId });

    expect(await visibleNames(a.cookie)).toEqual(["C1 của A", "C4 A tạo"]);
    expect(await visibleNames(b.cookie)).toEqual(["C2 của B"]);
    expect((await visibleNames(admin)).length).toBe(4);

    // Khách ngoài phạm vi coi như không tồn tại, với mọi thao tác.
    expect((await as(a.cookie).get(`/api/customers/${c2.id}`)).status).toBe(404);
    expect((await as(a.cookie).send(`/api/customers/${c2.id}`, "PUT", customer("Sửa trộm"))).status).toBe(404);
    expect((await as(a.cookie).send(`/api/customers/${c2.id}`, "DELETE")).status).toBe(404);
    expect((await as(a.cookie).send(`/api/customers/${c2.id}/notes`, "POST", { content: "x" })).status).toBe(404);
    expect((await as(a.cookie).get(`/api/customers?careEmployeeId=${b.employeeId}`)).status).toBe(200);
    expect(await data<Page<unknown>>(await as(a.cookie).get(`/api/customers?careEmployeeId=${b.employeeId}`))).toMatchObject({ pagination: { total: 0 } });

    const sheet = await readXlsx(await as(a.cookie).get("/api/customers/export"));
    expect(sheet.dataRows.map((_, i) => sheet.cell(i, "Tên khách hàng")?.value).sort()).toEqual(["C1 của A", "C4 A tạo"]);
  });

  it("keeps a customer visible to its creator after reassignment, and lets only admins reassign", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    const b = await employeeAccount("nv.b", "Nhân viên B");
    const mine = await createCustomer(a.cookie, customer("Khách A tạo"));
    const picked = await createCustomer(admin, customer("Khách giao cho A", { careEmployeeId: a.employeeId }));

    // Employee sửa khách: người chăm sóc giữ nguyên dù gửi giá trị khác.
    expect((await as(a.cookie).send(`/api/customers/${picked.id}`, "PUT", customer("Khách giao cho A", { careEmployeeId: null }))).status).toBe(200);
    expect((await data<{ careEmployeeId: number }>(await as(admin).get(`/api/customers/${picked.id}`))).careEmployeeId).toBe(a.employeeId);

    // Admin giao lại cho B: A vẫn thấy khách mình tạo, không còn thấy khách chỉ được giao.
    await as(admin).send(`/api/customers/${mine.id}`, "PUT", customer("Khách A tạo", { careEmployeeId: b.employeeId }));
    await as(admin).send(`/api/customers/${picked.id}`, "PUT", customer("Khách giao cho A", { careEmployeeId: b.employeeId }));
    expect(await visibleNames(a.cookie)).toEqual(["Khách A tạo"]);
    expect(await visibleNames(b.cookie)).toEqual(["Khách A tạo", "Khách giao cho A"]);
  });

  it("lets an employee without a linked profile see only what they created", async () => {
    const user = await as(admin).send("/api/users", "POST", { username: "kho", displayName: "Thủ kho", password: PASSWORD, role: "employee" });
    expect(user.status).toBe(201);
    const cookie = await login("kho");
    await createCustomer(admin, customer("Khách admin"));
    const own = await createCustomer(cookie, customer("Khách thủ kho"));
    expect(own.careEmployeeId).toBeNull();
    expect(await visibleNames(cookie)).toEqual(["Khách thủ kho"]);
  });
});

describe("VIP customers are admin-only", () => {
  const vipError = async (response: Response) => {
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN", fields: { tier: expect.any(String) } } });
  };

  it("does not let an employee add a VIP customer or raise one to VIP", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    await vipError(await as(a.cookie).send("/api/customers", "POST", customer("Nhà phân phối mới", { tier: "vip" })));
    expect(await visibleNames(a.cookie)).toEqual([]);

    const dealer = await createCustomer(a.cookie, customer("Đại lý", { tier: "normal" }));
    const retail = await createCustomer(a.cookie, customer("Khách lẻ", { tier: "basic" }));
    await vipError(await as(a.cookie).send(`/api/customers/${dealer.id}`, "PUT", customer("Đại lý", { tier: "vip" })));
    // Đổi giữa các hạng không phải VIP thì được.
    expect((await as(a.cookie).send(`/api/customers/${retail.id}`, "PUT", customer("Khách lẻ", { tier: "normal" }))).status).toBe(200);
  });

  it("lets an employee edit an assigned VIP customer but not change its tier", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    const vip = await createCustomer(admin, customer("NPP Hoàng Gia", { tier: "vip", careEmployeeId: a.employeeId }));
    const edited = await as(a.cookie).send(`/api/customers/${vip.id}`, "PUT", customer("NPP Hoàng Gia", { tier: "vip", phone: "0901234567" }));
    expect(edited.status).toBe(200);
    expect(await data(edited)).toMatchObject({ tier: "vip", phone: "0901234567" });
    await vipError(await as(a.cookie).send(`/api/customers/${vip.id}`, "PUT", customer("NPP Hoàng Gia", { tier: "basic" })));
    expect((await data<{ tier: string }>(await as(admin).get(`/api/customers/${vip.id}`))).tier).toBe("vip");
  });

  it("lets admins add, raise and lower VIP customers", async () => {
    const vip = await createCustomer(admin, customer("NPP", { tier: "vip" }));
    expect((await as(admin).send(`/api/customers/${vip.id}`, "PUT", customer("NPP", { tier: "normal" }))).status).toBe(200);
    expect((await as(admin).send(`/api/customers/${vip.id}`, "PUT", customer("NPP", { tier: "vip" }))).status).toBe(200);
  });
});

describe("inventory exports by employees", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO product_categories (id, code, name) VALUES (1, 'DM1', 'Chung')"),
      env.DB.prepare("INSERT INTO products (id, sku, name, category_id, unit, cost_price, sale_price) VALUES (1, 'SP1', 'Bóng đèn', 1, 'Cái', 10000, 20000)"),
      env.DB.prepare("INSERT INTO inventory_transactions (id, code, type, status, transaction_date) VALUES (1, 'PN-1', 'import', 'draft', '2026-01-01')"),
      env.DB.prepare("INSERT INTO inventory_transaction_items (transaction_id, product_id, quantity_delta, unit_price) VALUES (1, 1, 50, 10000)"),
      env.DB.prepare("UPDATE inventory_transactions SET status = 'confirmed', confirmed_at = '2026-01-01T00:00:00Z' WHERE id = 1"),
    ]);
  });
  const exportTo = (cookie: string, recipient: object) =>
    as(cookie).send("/api/inventory/export", "POST", { transactionDate: vnToday(), confirm: true, ...recipient, lines: [{ productId: 1, quantity: 1 }] });

  it("allows only customers in the employee's scope as recipients", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    const b = await employeeAccount("nv.b", "Nhân viên B");
    const ofA = await createCustomer(admin, customer("Khách A", { careEmployeeId: a.employeeId }));
    const ofB = await createCustomer(admin, customer("Khách B", { careEmployeeId: b.employeeId }));

    const ok = await exportTo(a.cookie, { customerId: ofA.id });
    expect(ok.status).toBe(201);
    const document = await data<{ createdBy: number; confirmedBy: number; updatedBy: number }>(ok);
    expect(document).toMatchObject({ createdBy: a.userId, confirmedBy: a.userId, updatedBy: a.userId });

    const other = await exportTo(a.cookie, { customerId: ofB.id });
    expect(other.status).toBe(422);
    expect(await other.json()).toMatchObject({ error: { fields: { customerId: expect.any(String) } } });
    expect((await exportTo(a.cookie, { employeeId: b.employeeId })).status).toBe(422);
    // Admin không bị giới hạn.
    expect((await exportTo(admin, { customerId: ofB.id })).status).toBe(201);
  });
});

describe("who did it and when", () => {
  it("stores the creator and last editor on records", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    const row = await createCustomer(a.cookie, customer("Khách mới"));
    expect(row).toMatchObject({ createdBy: a.userId, updatedBy: a.userId });
    await as(admin).send(`/api/customers/${row.id}`, "PUT", customer("Khách mới (đã sửa)"));
    expect(await data(await as(admin).get(`/api/customers/${row.id}`))).toMatchObject({ createdBy: a.userId, updatedBy: 1 });

    const product = await data<{ id: number; createdBy: number }>(
      await as(a.cookie).send("/api/products", "POST", { name: "Ổ cắm", categoryId: (await data<{ id: number }>(await as(admin).send("/api/product-categories", "POST", { name: "Điện" }))).id, unit: "Cái", costPrice: 1, salePrice: 2, minStock: 0, status: "active" }),
    );
    expect(product.createdBy).toBe(a.userId);
  });

  it("lists every action with user, time and object code for admins", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    const row = await createCustomer(a.cookie, customer("Khách nhật ký"));
    const logs = await data<Page<{ actorName: string; action: string; entityCode: string; createdAt: string }>>(
      await as(admin).get(`/api/audit-logs?actorId=${a.userId}&entityType=customer`),
    );
    expect(logs.items).toEqual([expect.objectContaining({ actorName: "Nhân viên A", action: "customer.create", entityCode: row.code })]);
    expect(Date.parse(logs.items[0]!.createdAt)).toBeGreaterThan(Date.now() - 60_000);

    const history = await data<Page<{ action: string }>>(await as(admin).get(`/api/audit-logs?entityType=customer&entityId=${row.id}`));
    expect(history.items.map((item) => item.action)).toEqual(["customer.create"]);
    const sheet = await readXlsx(await as(admin).get("/api/audit-logs/export"));
    expect(sheet.headers).toEqual(["Thời gian", "Người thực hiện", "Thao tác", "Đối tượng", "Mã"]);
    expect(sheet.dataRows.some((_, i) => sheet.cell(i, "Thao tác")?.value === "Thêm khách hàng")).toBe(true);
  });

  it("gives everyone the user names to show who did it", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    const names = await data<{ id: number; displayName: string }[]>(await as(a.cookie).get("/api/user-names"));
    expect(names.map((n) => n.displayName).sort()).toEqual(["Nhân viên A", "Quản trị viên"]);
  });
});

describe("user management", () => {
  it("validates usernames and one account per employee", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    const duplicate = await as(admin).send("/api/users", "POST", { username: "NV.A", displayName: "X", password: PASSWORD, role: "employee" });
    expect(duplicate.status).toBe(422);
    expect(await duplicate.json()).toMatchObject({ error: { fields: { username: expect.any(String) } } });
    const sameEmployee = await as(admin).send("/api/users", "POST", { username: "nv.a2", displayName: "X", password: PASSWORD, role: "employee", employeeId: a.employeeId });
    expect(await sameEmployee.json()).toMatchObject({ error: { fields: { employeeId: expect.any(String) } } });
    const weak = await as(admin).send("/api/users", "POST", { username: "nv.c", displayName: "X", password: "ngan", role: "root" });
    expect(Object.keys(((await weak.json()) as { error: { fields: object } }).error.fields).sort()).toEqual(["password", "role"]);
  });

  it("never leaves the system without an active admin", async () => {
    const self = { displayName: "Quản trị viên", employeeId: null };
    expect((await as(admin).send("/api/users/1", "PUT", { ...self, role: "employee", active: true })).status).toBe(422);
    expect((await as(admin).send("/api/users/1", "PUT", { ...self, role: "admin", active: false })).status).toBe(422);

    const second = await data<{ id: number }>(await as(admin).send("/api/users", "POST", { username: "admin2", displayName: "Admin 2", password: PASSWORD, role: "admin" }));
    const other = await login("admin2");
    // Admin 2 hạ quyền Admin 1 được (vẫn còn Admin 2), nhưng không tự hạ mình.
    expect((await as(other).send("/api/users/1", "PUT", { ...self, role: "employee", active: true })).status).toBe(200);
    expect((await as(other).send(`/api/users/${second.id}`, "PUT", { displayName: "Admin 2", employeeId: null, role: "employee", active: true })).status).toBe(422);
  });

  it("locks out deactivated accounts immediately and on the next login", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    expect((await as(admin).send(`/api/users/${a.userId}`, "PUT", { displayName: "Nhân viên A", employeeId: a.employeeId, role: "employee", active: false })).status).toBe(200);
    expect((await as(a.cookie).get("/api/customers")).status).toBe(401);
    const relogin = await api("/api/auth/login", { body: { username: "nv.a", password: PASSWORD } });
    expect(relogin.status).toBe(403);
    expect(await relogin.json()).toMatchObject({ error: { code: "ACCOUNT_DISABLED" } });
    // Sai mật khẩu vẫn báo lỗi chung, không lộ là tài khoản bị khoá.
    expect((await api("/api/auth/login", { body: { username: "nv.a", password: "sai-mat-khau-123" } })).status).toBe(401);
  });

  it("resets a password and signs the user out everywhere", async () => {
    const a = await employeeAccount("nv.a", "Nhân viên A");
    expect((await as(admin).send(`/api/users/${a.userId}/reset-password`, "POST", { password: "mat-khau-moi-cua-a" })).status).toBe(200);
    expect((await as(a.cookie).get("/api/customers")).status).toBe(401);
    expect((await api("/api/auth/login", { body: { username: "nv.a", password: PASSWORD } })).status).toBe(401);
    await login("nv.a", "mat-khau-moi-cua-a");
    const audit = await data<Page<{ action: string }>>(await as(admin).get(`/api/audit-logs?entityType=admin_user&entityId=${a.userId}`));
    expect(audit.items.map((i) => i.action)).toContain("user.password_reset");
  });
});
