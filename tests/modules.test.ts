import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, vnToday } from "../src/shared/format";
import { api, createAdmin, loginAsAdmin } from "./helpers";
import { readXlsx } from "./xlsx-reader";

let cookie = "";

const send = (path: string, method: string, body?: unknown) =>
  api(path, { method, body, cookie });
const read = async <T = never>(path: string) => {
  const response = await api(path, { cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: T }).data;
};
const created = async <T = { id: number; code: string }>(path: string, body: unknown) => {
  const response = await send(path, "POST", body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: T }).data;
};
type Page<T> = { items: T[]; pagination: { total: number; totalPages: number } };

const employee = { fullName: "Nguyễn Văn Đức", status: "active", phone: "0912 345 678" };
const customer = { name: "Công ty TNHH Ánh Dương", type: "business", phone: "0243.123.4567" };
const product = (categoryId: number, extra = {}) => ({
  name: "Bút bi Thiên Long",
  categoryId,
  unit: "Cái",
  costPrice: 3000,
  salePrice: 5000,
  minStock: 5,
  status: "active",
  ...extra,
});

beforeEach(async () => {
  await createAdmin();
  cookie = await loginAsAdmin();
});

describe("access control", () => {
  it.each([
    "/api/employees",
    "/api/customers",
    "/api/products",
    "/api/product-categories",
    "/api/inventory/transactions",
    "/api/inventory/balances",
    "/api/dashboard/summary",
    "/api/dashboard/charts",
    "/api/reports/inventory",
    "/api/reports/inventory/export",
    "/api/settings",
  ])("requires a session for %s", async (path) => {
    expect((await api(path)).status).toBe(401);
  });
});

describe("employees", () => {
  it("creates, reads, updates and soft-deletes", async () => {
    const row = await created("/api/employees", employee);
    expect(row.code).toBe("NV0001");
    const detail = await read<{ phone: string }>(`/api/employees/${row.id}`);
    expect(detail.phone).toBe("0912345678");

    const updated = await send(`/api/employees/${row.id}`, "PUT", { ...employee, status: "resigned" });
    expect(updated.status).toBe(200);
    expect((await send(`/api/employees/${row.id}`, "DELETE")).status).toBe(200);
    expect((await api(`/api/employees/${row.id}`, { cookie })).status).toBe(404);
    const stored = await env.DB.prepare("SELECT deleted_at FROM employees WHERE id = ?")
      .bind(row.id)
      .first<{ deleted_at: string }>();
    expect(stored?.deleted_at).toBeTruthy();
  });

  it("requires a unique code but frees it after deletion", async () => {
    const first = await created("/api/employees", { ...employee, code: "nv-01" });
    expect(first.code).toBe("NV-01");
    const clash = await send("/api/employees", "POST", { ...employee, code: "NV-01" });
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ error: { fields: { code: expect.any(String) } } });
    await send(`/api/employees/${first.id}`, "DELETE");
    await created("/api/employees", { ...employee, code: "NV-01" });
  });

  it("validates input on the server", async () => {
    const response = await send("/api/employees", "POST", {
      fullName: " ",
      status: "boss",
      email: "khong-hop-le",
      phone: "12",
      hireDate: "2026-02-31",
    });
    expect(response.status).toBe(422);
    const { error } = (await response.json()) as { error: { fields: Record<string, string> } };
    expect(Object.keys(error.fields).sort()).toEqual(["email", "fullName", "hireDate", "phone", "status"]);
  });

  it("searches without accents, filters, sorts and paginates", async () => {
    await created("/api/employees", employee);
    await created("/api/employees", { fullName: "Trần Thị Bình", status: "on_leave" });
    await created("/api/employees", { fullName: "Lê 100% Hoàng", status: "active" });

    const byName = await read<Page<{ fullName: string }>>("/api/employees?search=nguyen%20van%20duc");
    expect(byName.items.map((row) => row.fullName)).toEqual(["Nguyễn Văn Đức"]);
    const upper = await read<Page<unknown>>("/api/employees?search=TR%E1%BA%A6N");
    expect(upper.pagination.total).toBe(1);
    const wildcard = await read<Page<unknown>>("/api/employees?search=%25");
    expect(wildcard.pagination.total).toBe(1);
    const filtered = await read<Page<unknown>>("/api/employees?status=on_leave");
    expect(filtered.pagination.total).toBe(1);
    const sorted = await read<Page<{ code: string }>>("/api/employees?sort=code&dir=asc&pageSize=2&page=2");
    expect(sorted.items.map((row) => row.code)).toEqual(["NV0003"]);
    expect(sorted.pagination).toMatchObject({ total: 3, totalPages: 2 });
    expect((await api("/api/employees?sort=password", { cookie })).status).toBe(422);
  });

  it("exports an Excel file with typed cells and no formulas", async () => {
    await created("/api/employees", { ...employee, hireDate: "2024-03-15", note: '=HYPERLINK("x"), "y"' });
    const response = await api("/api/employees/export", { cookie });
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toContain('filename="nhan-vien.xlsx"');
    const sheet = await readXlsx(response);
    expect(sheet.sheetName).toBe("Nhân viên");
    expect(sheet.cell(0, "Họ và tên")).toMatchObject({ type: "text", value: "Nguyễn Văn Đức" });
    expect(sheet.cell(0, "Trạng thái")?.value).toBe("Đang làm việc");
    // Số điện thoại giữ số 0 ở đầu; ngày vào làm là ngày thật của Excel.
    expect(sheet.cell(0, "Số điện thoại")).toMatchObject({ type: "text", value: "0912345678" });
    expect(sheet.cell(0, "Ngày vào làm")?.type).toBe("date");
    expect(sheet.cell(0, "Ghi chú")).toMatchObject({ type: "text", value: '=HYPERLINK("x"), "y"' });
    expect(sheet.files.get("xl/worksheets/sheet1.xml")).not.toContain("<f>");
  });
});

describe("customers", () => {
  it("supports CRUD, search and type filter", async () => {
    const row = await created("/api/customers", customer);
    await created("/api/customers", { name: "Phạm Minh Tuấn", type: "individual" });
    expect(row.code).toBe("KH0001");
    const found = await read<Page<{ id: number }>>("/api/customers?search=anh%20duong");
    expect(found.items.map((item) => item.id)).toEqual([row.id]);
    expect((await read<Page<unknown>>("/api/customers?type=individual")).pagination.total).toBe(1);
    expect((await send(`/api/customers/${row.id}`, "PUT", { ...customer, taxCode: "0101234567" })).status).toBe(200);
    expect((await send(`/api/customers/${row.id}`, "PUT", { ...customer, taxCode: "abc" })).status).toBe(422);
    expect((await send(`/api/customers/${row.id}`, "DELETE")).status).toBe(200);
    expect((await read<Page<unknown>>("/api/customers")).pagination.total).toBe(1);
  });

  it("filters by creation date in Vietnam time", async () => {
    const row = await created("/api/customers", customer);
    // 18:30 UTC on the 9th is already 01:30 on the 10th in Vietnam.
    await env.DB.prepare("UPDATE customers SET created_at = '2026-03-09T18:30:00.000Z' WHERE id = ?")
      .bind(row.id)
      .run();
    const inside = await read<Page<unknown>>("/api/customers?createdFrom=2026-03-10&createdTo=2026-03-10");
    const outside = await read<Page<unknown>>("/api/customers?createdFrom=2026-03-09&createdTo=2026-03-09");
    expect(inside.pagination.total).toBe(1);
    expect(outside.pagination.total).toBe(0);
  });

  it("keeps notes on the customer profile", async () => {
    const row = await created("/api/customers", customer);
    const note = await created(`/api/customers/${row.id}/notes`, { content: "Gọi lại vào thứ Hai" });
    const detail = await read<{ notes: { content: string }[] }>(`/api/customers/${row.id}`);
    expect(detail.notes.map((item) => item.content)).toEqual(["Gọi lại vào thứ Hai"]);
    expect((await send(`/api/customers/${row.id + 1}/notes/${note.id}`, "DELETE")).status).toBe(404);
    expect((await send(`/api/customers/${row.id}/notes/${note.id}`, "DELETE")).status).toBe(200);
  });
});

describe("employee base salary and address", () => {
  const range = `from=${addDays(vnToday(), -6)}&to=${vnToday()}`;

  it("stores an optional whole-VND base salary", async () => {
    const row = await created("/api/employees", { ...employee, baseSalary: 12_500_000 });
    expect((await read<{ baseSalary: number }>(`/api/employees/${row.id}`)).baseSalary).toBe(12_500_000);

    const blank = await created("/api/employees", { fullName: "Trần Thị Bình", status: "active" });
    expect((await read<{ baseSalary: number | null }>(`/api/employees/${blank.id}`)).baseSalary).toBeNull();

    const cleared = await send(`/api/employees/${row.id}`, "PUT", { ...employee, baseSalary: null });
    expect(cleared.status).toBe(200);
    expect((await read<{ baseSalary: number | null }>(`/api/employees/${row.id}`)).baseSalary).toBeNull();
  });

  it.each([-1, 1.5, 2_000_000_000_000, "10tr"])("rejects base salary %s", async (baseSalary) => {
    const response = await send("/api/employees", "POST", { ...employee, baseSalary });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { fields: { baseSalary: expect.any(String) } } });
  });

  it("keeps the CHECK constraint in the database", async () => {
    const row = await created("/api/employees", employee);
    await expect(
      env.DB.prepare("UPDATE employees SET base_salary = -5 WHERE id = ?").bind(row.id).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("sorts by salary, searches by address and exports both", async () => {
    await created("/api/employees", { ...employee, baseSalary: 9_000_000, address: "45 Nguyễn Trãi, Thanh Xuân" });
    await created("/api/employees", { fullName: "Lê Hoàng", status: "active", baseSalary: 20_000_000 });

    const sorted = await read<Page<{ baseSalary: number }>>("/api/employees?sort=baseSalary&dir=desc");
    expect(sorted.items.map((item) => item.baseSalary)).toEqual([20_000_000, 9_000_000]);
    const byAddress = await read<Page<{ fullName: string }>>("/api/employees?search=nguyen%20trai");
    expect(byAddress.items.map((item) => item.fullName)).toEqual(["Nguyễn Văn Đức"]);

    const sheet = await readXlsx(await api("/api/employees/export?sort=baseSalary&dir=asc", { cookie }));
    expect(sheet.headers).toContain("Lương cơ bản (VND)");
    expect(sheet.cell(0, "Lương cơ bản (VND)")).toMatchObject({ type: "number", value: "9000000" });
    expect(sheet.cell(0, "Địa chỉ")?.value).toBe("45 Nguyễn Trãi, Thanh Xuân");
  });

  it("reports the base payroll of active employees only", async () => {
    await created("/api/employees", { ...employee, baseSalary: 10_000_000 });
    await created("/api/employees", { fullName: "Trần Thị Bình", status: "active", baseSalary: 7_000_000 });
    await created("/api/employees", { fullName: "Phạm Văn C", status: "active" });
    await created("/api/employees", { fullName: "Lê Văn D", status: "resigned", baseSalary: 50_000_000 });
    expect(await read(`/api/reports/employees?${range}`)).toMatchObject({ total: 4, active: 3, activePayroll: 17_000_000 });
  });
});

describe("customer tier", () => {
  const range = `from=${addDays(vnToday(), -6)}&to=${vnToday()}`;

  it("defaults to normal and accepts VIP", async () => {
    const normal = await created<{ id: number; tier: string }>("/api/customers", customer);
    expect(normal.tier).toBe("normal");
    const vip = await created<{ id: number; tier: string }>("/api/customers", {
      name: "Trần Minh Quân",
      type: "individual",
      tier: "vip",
    });
    expect(vip.tier).toBe("vip");
    expect((await send(`/api/customers/${normal.id}`, "PUT", { ...customer, tier: "vip" })).status).toBe(200);
    expect((await read<{ tier: string }>(`/api/customers/${normal.id}`)).tier).toBe("vip");
  });

  it("rejects unknown tiers in the API and the database", async () => {
    const response = await send("/api/customers", "POST", { ...customer, tier: "gold" });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { fields: { tier: expect.any(String) } } });
    expect((await api("/api/customers?tier=gold", { cookie })).status).toBe(422);

    const row = await created("/api/customers", customer);
    await expect(
      env.DB.prepare("UPDATE customers SET tier = 'gold' WHERE id = ?").bind(row.id).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("filters, sorts VIP first, searches by address, exports and reports", async () => {
    await created("/api/customers", { ...customer, address: "12 Lý Thường Kiệt, Hà Nội" });
    await created("/api/customers", { name: "Khách VIP", type: "individual", tier: "vip" });
    await created("/api/customers", { name: "Khách thường", type: "individual" });

    expect((await read<Page<unknown>>("/api/customers?tier=vip")).pagination.total).toBe(1);
    expect((await read<Page<unknown>>("/api/customers?tier=normal")).pagination.total).toBe(2);
    const sorted = await read<Page<{ name: string }>>("/api/customers?sort=tier&dir=desc");
    expect(sorted.items[0]?.name).toBe("Khách VIP");
    const byAddress = await read<Page<{ name: string }>>("/api/customers?search=ly%20thuong%20kiet");
    expect(byAddress.items.map((item) => item.name)).toEqual([customer.name]);

    const sheet = await readXlsx(await api("/api/customers/export?tier=vip", { cookie }));
    expect(sheet.dataRows).toHaveLength(1);
    expect(sheet.cell(0, "Tên khách hàng")?.value).toBe("Khách VIP");
    expect(sheet.cell(0, "Hạng khách hàng")?.value).toBe("VIP (Nhà phân phối)");
    expect(sheet.cell(0, "Ngày tạo")?.type).toBe("date");

    expect(await read(`/api/reports/customers?${range}`)).toMatchObject({ total: 3, vip: 1 });
  });
});

describe("customer tiers and care employee", () => {
  it("accepts the three tiers and labels them by sales channel", async () => {
    for (const tier of ["vip", "normal", "basic"]) {
      const row = await created<{ id: number; tier: string }>("/api/customers", { ...customer, name: `Khách ${tier}`, tier });
      expect(row.tier).toBe(tier);
    }
    const sorted = await read<Page<{ tier: string }>>("/api/customers?sort=tier&dir=desc");
    expect(sorted.items.map((item) => item.tier)).toEqual(["vip", "normal", "basic"]);
    const sheet = await readXlsx(await api("/api/customers/export?sort=tier&dir=desc", { cookie }));
    expect(sheet.dataRows.map((_, i) => sheet.cell(i, "Hạng khách hàng")?.value)).toEqual([
      "VIP (Nhà phân phối)",
      "Bình thường (Đại lý)",
      "Cơ bản (Khách lẻ)",
    ]);
    expect(await read(`/api/reports/customers?from=${addDays(vnToday(), -6)}&to=${vnToday()}`)).toMatchObject({
      vip: 1,
      normal: 1,
      basic: 1,
    });
  });

  it("assigns an optional care employee and shows who it is", async () => {
    const staff = await created("/api/employees", employee);
    const assigned = await created<{ id: number; careEmployeeId: number; careEmployeeCode: string; careEmployeeName: string }>(
      "/api/customers",
      { ...customer, careEmployeeId: staff.id },
    );
    expect(assigned).toMatchObject({ careEmployeeId: staff.id, careEmployeeCode: staff.code, careEmployeeName: "Nguyễn Văn Đức" });

    const unassigned = await created<{ careEmployeeId: number | null; careEmployeeName: string | null }>("/api/customers", {
      name: "Khách tự đến",
      type: "individual",
      careEmployeeId: "",
    });
    expect(unassigned).toMatchObject({ careEmployeeId: null, careEmployeeName: null });

    const mine = await read<Page<{ id: number }>>(`/api/customers?careEmployeeId=${staff.id}`);
    expect(mine.items.map((item) => item.id)).toEqual([assigned.id]);
    const sheet = await readXlsx(await api(`/api/customers/export?careEmployeeId=${staff.id}`, { cookie }));
    expect(sheet.cell(0, "Nhân viên chăm sóc")?.value).toBe(`${staff.code} · Nguyễn Văn Đức`);

    // Bỏ phân công khi sửa.
    const cleared = await send(`/api/customers/${assigned.id}`, "PUT", { ...customer, careEmployeeId: null });
    expect(cleared.status).toBe(200);
    expect((await read<{ careEmployeeId: number | null }>(`/api/customers/${assigned.id}`)).careEmployeeId).toBeNull();
  });

  it("rejects unknown or deleted employees", async () => {
    const missing = await send("/api/customers", "POST", { ...customer, careEmployeeId: 999 });
    expect(missing.status).toBe(422);
    expect(await missing.json()).toMatchObject({ error: { fields: { careEmployeeId: expect.any(String) } } });
    expect((await send("/api/customers", "POST", { ...customer, careEmployeeId: "abc" })).status).toBe(422);

    const staff = await created("/api/employees", employee);
    await send(`/api/employees/${staff.id}`, "DELETE");
    expect((await send("/api/customers", "POST", { ...customer, careEmployeeId: staff.id })).status).toBe(422);
  });

  it("keeps the customer's own code and name next to the employee's", async () => {
    const staff = await created("/api/employees", { ...employee, code: "NV-77" });
    const row = await created<{ code: string; name: string }>("/api/customers", { ...customer, code: "KH-55", careEmployeeId: staff.id });
    expect(row).toMatchObject({ code: "KH-55", name: customer.name });
    const list = await read<Page<{ code: string; name: string; careEmployeeCode: string }>>("/api/customers");
    expect(list.items[0]).toMatchObject({ code: "KH-55", name: customer.name, careEmployeeCode: "NV-77" });
  });

  it("unassigns customers when their care employee is deleted", async () => {
    const staff = await created("/api/employees", employee);
    const row = await created("/api/customers", { ...customer, careEmployeeId: staff.id });
    expect((await send(`/api/employees/${staff.id}`, "DELETE")).status).toBe(200);
    const after = await read<{ careEmployeeId: number | null; careEmployeeName: string | null }>(`/api/customers/${row.id}`);
    expect(after).toMatchObject({ careEmployeeId: null, careEmployeeName: null });
  });
});

describe("products and categories", () => {
  let categoryId = 0;
  beforeEach(async () => {
    categoryId = (await created("/api/product-categories", { name: "Văn phòng phẩm" })).id;
  });

  it("stores distributor and dealer prices, blank meaning the retail price", async () => {
    const priced = await created<{ id: number; salePrice: number; dealerPrice: number | null; distributorPrice: number | null }>(
      "/api/products",
      product(categoryId, { dealerPrice: 4500, distributorPrice: 4000 }),
    );
    expect(priced).toMatchObject({ salePrice: 5000, dealerPrice: 4500, distributorPrice: 4000 });

    const plain = await created<{ dealerPrice: number | null; distributorPrice: number | null }>(
      "/api/products",
      product(categoryId, { name: "Thước kẻ", dealerPrice: null }),
    );
    expect(plain).toMatchObject({ dealerPrice: null, distributorPrice: null });

    const bad = await send("/api/products", "POST", product(categoryId, { dealerPrice: -1, distributorPrice: 1.5 }));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ error: { fields: { dealerPrice: expect.any(String), distributorPrice: expect.any(String) } } });

    // Excel luôn có số: giá để trống xuất ra bằng giá lẻ.
    const sheet = await readXlsx(await api("/api/products/export?sort=name&dir=asc", { cookie }));
    expect(sheet.headers).toEqual(expect.arrayContaining(["Giá phân phối (VND)", "Giá đại lý (VND)", "Giá khách lẻ (VND)"]));
    const rowOf = (name: string) => sheet.dataRows.findIndex((_, i) => sheet.cell(i, "Tên sản phẩm")?.value === name);
    const pen = rowOf("Bút bi Thiên Long");
    const ruler = rowOf("Thước kẻ");
    expect([sheet.cell(pen, "Giá phân phối (VND)")?.value, sheet.cell(pen, "Giá đại lý (VND)")?.value]).toEqual(["4000", "4500"]);
    expect([sheet.cell(ruler, "Giá phân phối (VND)")?.value, sheet.cell(ruler, "Giá đại lý (VND)")?.value]).toEqual(["5000", "5000"]);
  });

  it("supports CRUD and a unique SKU", async () => {
    const row = await created<{ id: number; sku: string; quantity: number; stockStatus: string }>(
      "/api/products",
      product(categoryId, { sku: "bb-01" }),
    );
    expect(row).toMatchObject({ sku: "BB-01", quantity: 0, stockStatus: "out_of_stock" });
    expect((await send("/api/products", "POST", product(categoryId, { sku: "BB-01" }))).status).toBe(409);
    const changed = await send(`/api/products/${row.id}`, "PUT", product(categoryId, { salePrice: 6000 }));
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ data: { salePrice: 6000, sku: "BB-01" } });
    expect((await send(`/api/products/${row.id}`, "DELETE")).status).toBe(200);
    await created("/api/products", product(categoryId, { sku: "BB-01" }));
  });

  it("stores electrical product details and searches them without accents", async () => {
    const row = await created<{ id: number; warrantyMonths: number }>(
      "/api/products",
      product(categoryId, { name: "Đèn pha LED", brand: "Rạng Đông", specifications: "220V · 50W", warrantyMonths: 24 }),
    );
    expect(row).toMatchObject({ warrantyMonths: 24 });
    for (const search of ["rang dong", "50w"]) {
      const found = await read<Page<{ id: number }>>(`/api/products?search=${encodeURIComponent(search)}`);
      expect(found.items.map((item) => item.id)).toEqual([row.id]);
    }
    expect((await created<{ warrantyMonths: number }>("/api/products", product(categoryId))).warrantyMonths).toBe(0);
    expect((await send("/api/products", "POST", product(categoryId, { warrantyMonths: -1 }))).status).toBe(422);
    expect((await send("/api/products", "POST", product(categoryId, { warrantyMonths: 1.5 }))).status).toBe(422);
  });

  it("rejects fractional prices and unknown categories", async () => {
    expect((await send("/api/products", "POST", product(categoryId, { costPrice: 10.5 }))).status).toBe(422);
    const response = await send("/api/products", "POST", product(9999));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { fields: { categoryId: expect.any(String) } } });
  });

  it("protects categories that are in use", async () => {
    const row = await created("/api/products", product(categoryId));
    expect((await send("/api/product-categories", "POST", { name: "Văn phòng phẩm" })).status).toBe(409);
    expect((await send(`/api/product-categories/${categoryId}`, "DELETE")).status).toBe(409);
    await send(`/api/products/${row.id}`, "DELETE");
    expect((await send(`/api/product-categories/${categoryId}`, "DELETE")).status).toBe(200);
  });

  it("filters by category and stock status", async () => {
    const other = await created("/api/product-categories", { name: "Điện tử" });
    await created("/api/products", product(other.id, { name: "Chuột không dây" }));
    await created("/api/products", product(categoryId));
    const inCategory = await read<Page<{ categoryName: string }>>(`/api/products?categoryId=${other.id}`);
    expect(inCategory.items.map((row) => row.categoryName)).toEqual(["Điện tử"]);
    expect((await read<Page<unknown>>("/api/products?stockStatus=out_of_stock")).pagination.total).toBe(2);
    expect((await read<Page<unknown>>("/api/products?stockStatus=in_stock")).pagination.total).toBe(0);
  });
});

describe("settings", () => {
  it("saves company information and rejects unsafe logos", async () => {
    const body = { companyName: "Công ty An Phát", appName: "An Phát", phone: "0901234567" };
    expect((await send("/api/settings", "PUT", body)).status).toBe(200);
    expect(await read("/api/settings")).toMatchObject({
      companyName: "Công ty An Phát",
      appName: "An Phát",
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
    });
    const unsafe = { ...body, logo: "data:image/svg+xml;base64,PHN2Zz4=" };
    expect((await send("/api/settings", "PUT", unsafe)).status).toBe(422);
  });
});
