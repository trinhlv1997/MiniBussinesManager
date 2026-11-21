import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { api, createAdmin, loginAsAdmin } from "./helpers";

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

  it("exports safe CSV with a byte order mark", async () => {
    await created("/api/employees", { ...employee, note: '=HYPERLINK("x"), "y"' });
    const response = await api("/api/employees/export", { cookie });
    expect(response.headers.get("content-type")).toContain("text/csv");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Nguyễn Văn Đức");
    expect(text).toContain("Đang làm việc");
    expect(text).toContain(`"'=HYPERLINK(""x""), ""y"""`);
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

describe("products and categories", () => {
  let categoryId = 0;
  beforeEach(async () => {
    categoryId = (await created("/api/product-categories", { name: "Văn phòng phẩm" })).id;
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
