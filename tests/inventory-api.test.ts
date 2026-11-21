import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, vnToday } from "../src/shared/format";
import type {
  DashboardCharts,
  DashboardSummary,
  InventoryReport,
  InventoryTransactionDetail,
  ProductReport,
} from "../src/shared/types";
import { api, createAdmin, loginAsAdmin } from "./helpers";

let cookie = "";
const today = vnToday();
const PEN = 1;
const BOOK = 2;
const CUSTOMER = 1;
const EMPLOYEE = 1;

const post = (path: string, body: unknown = undefined) =>
  api(path, { method: "POST", body, cookie });
const dataOf = async <T>(response: Response) => ((await response.json()) as { data: T }).data;
const read = async <T>(path: string) => {
  const response = await api(path, { cookie });
  expect(response.status).toBe(200);
  return dataOf<T>(response);
};
const document = (productId: number, quantity: number, confirm = true, unitPrice?: number) => ({
  transactionDate: today,
  confirm,
  // Ignored by imports; exports need a recipient to be confirmed.
  customerId: CUSTOMER,
  lines: [{ productId, quantity, unitPrice }],
});
async function create(kind: "import" | "export", productId: number, quantity: number, confirm = true) {
  const response = await post(`/api/inventory/${kind}`, document(productId, quantity, confirm));
  expect(response.status).toBe(201);
  return dataOf<InventoryTransactionDetail>(response);
}

async function stock(productId = PEN) {
  const row = await env.DB.prepare("SELECT quantity FROM inventory_balances WHERE product_id = ?")
    .bind(productId)
    .first<{ quantity: number }>();
  return row?.quantity;
}

async function expectLedgerMatchesBalances() {
  const { results } = await env.DB.prepare(`
    SELECT b.product_id, b.quantity, COALESCE(SUM(i.quantity_delta), 0) AS ledger
    FROM inventory_balances b
    LEFT JOIN inventory_transaction_items i ON i.product_id = b.product_id
      AND i.transaction_id IN (SELECT id FROM inventory_transactions WHERE status = 'confirmed')
    GROUP BY b.product_id`).all<{ quantity: number; ledger: number }>();
  for (const row of results) expect(row.quantity).toBe(row.ledger);
}

beforeEach(async () => {
  await createAdmin();
  cookie = await loginAsAdmin();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO product_categories (id, code, name) VALUES (1, 'DM1', 'Văn phòng phẩm'), (2, 'DM2', 'Điện tử')"),
    env.DB.prepare(`INSERT INTO products (id, sku, name, category_id, unit, cost_price, sale_price, min_stock)
      VALUES (1, 'BUT', 'Bút bi', 1, 'Cái', 3000, 5000, 5), (2, 'SO', 'Sổ tay', 2, 'Cuốn', 10000, 15000, 2)`),
    env.DB.prepare(`INSERT INTO employees (code, full_name, status) VALUES ('NV1', 'A', 'active'), ('NV2', 'B', 'resigned')`),
    env.DB.prepare(`INSERT INTO customers (code, name, type) VALUES ('KH1', 'C', 'individual')`),
  ]);
});

describe("export recipients", () => {
  const exportBody = (extra: object, confirm = true) => ({
    transactionDate: today,
    confirm,
    lines: [{ productId: PEN, quantity: 1 }],
    ...extra,
  });
  const fieldsOf = async (response: Response) =>
    ((await response.json()) as { error: { fields: Record<string, string> } }).error.fields;

  beforeEach(async () => {
    await create("import", PEN, 10);
  });

  it("links an export to a customer or an employee", async () => {
    const toCustomer = await dataOf<InventoryTransactionDetail>(
      await post("/api/inventory/export", exportBody({ customerId: CUSTOMER, reference: "DH-1" })),
    );
    expect(toCustomer).toMatchObject({
      customerId: CUSTOMER,
      employeeId: null,
      recipientCode: "KH1",
      recipientName: "C",
      reference: "DH-1",
    });
    const toEmployee = await dataOf<InventoryTransactionDetail>(
      await post("/api/inventory/export", exportBody({ employeeId: EMPLOYEE })),
    );
    expect(toEmployee).toMatchObject({ customerId: null, employeeId: EMPLOYEE, recipientCode: "NV1", recipientName: "A" });

    const ofCustomer = await read<{ items: { id: number }[] }>(`/api/inventory/transactions?customerId=${CUSTOMER}`);
    expect(ofCustomer.items.map((row) => row.id)).toEqual([toCustomer.id]);
    const ofEmployee = await read<{ items: { id: number }[] }>(`/api/inventory/transactions?employeeId=${EMPLOYEE}`);
    expect(ofEmployee.items.map((row) => row.id)).toEqual([toEmployee.id]);
  });

  it("requires a recipient to confirm, but not to save a draft", async () => {
    const refused = await post("/api/inventory/export", exportBody({}));
    expect(refused.status).toBe(422);
    expect(await fieldsOf(refused)).toHaveProperty("customerId");
    expect(await stock()).toBe(10);

    const draft = await dataOf<InventoryTransactionDetail>(await post("/api/inventory/export", exportBody({}, false)));
    expect((await post(`/api/inventory/transactions/${draft.id}/confirm`)).status).toBe(422);
    expect(await stock()).toBe(10);

    const body = exportBody({ customerId: CUSTOMER }, false);
    expect((await api(`/api/inventory/export/${draft.id}`, { method: "PUT", body, cookie })).status).toBe(200);
    expect((await post(`/api/inventory/transactions/${draft.id}/confirm`)).status).toBe(200);
    expect(await stock()).toBe(9);
  });

  it("rejects two recipients and people who no longer exist", async () => {
    expect((await post("/api/inventory/export", exportBody({ customerId: CUSTOMER, employeeId: EMPLOYEE }))).status).toBe(422);
    expect(await fieldsOf(await post("/api/inventory/export", exportBody({ customerId: 999 })))).toHaveProperty("customerId");
    expect(await fieldsOf(await post("/api/inventory/export", exportBody({ employeeId: 999 })))).toHaveProperty("employeeId");
    expect((await api(`/api/customers/${CUSTOMER}`, { method: "DELETE", cookie })).status).toBe(200);
    expect((await post("/api/inventory/export", exportBody({ customerId: CUSTOMER }))).status).toBe(422);
  });

  it("keeps showing a deleted customer and finds documents by recipient name", async () => {
    const created = await dataOf<{ id: number }>(
      await post("/api/customers", { name: "Công ty Điện Hoàng Gia", type: "business" }),
    );
    const doc = await dataOf<InventoryTransactionDetail>(
      await post("/api/inventory/export", exportBody({ customerId: created.id })),
    );
    const found = await read<{ items: { id: number }[] }>("/api/inventory/transactions?search=dien%20hoang%20gia");
    expect(found.items.map((row) => row.id)).toEqual([doc.id]);
    await api(`/api/customers/${created.id}`, { method: "DELETE", cookie });
    const after = await read<InventoryTransactionDetail>(`/api/inventory/transactions/${doc.id}`);
    expect(after.recipientName).toBe("Công ty Điện Hoàng Gia");
  });

  it("enforces recipient rules in the database", async () => {
    const insert = (type: string, customerId: number, employeeId: number | null) =>
      env.DB.prepare(
        "INSERT INTO inventory_transactions (code, type, transaction_date, customer_id, employee_id) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(`T-${type}-${employeeId}`, type, today, customerId, employeeId)
        .run();
    await expect(insert("import", CUSTOMER, null)).rejects.toThrow(/INVENTORY_INVALID_RECIPIENT/);
    await expect(insert("export", CUSTOMER, EMPLOYEE)).rejects.toThrow(/INVENTORY_INVALID_RECIPIENT/);
  });
});

describe("revenue and gross profit", () => {
  const range = `from=${addDays(today, -6)}&to=${today}`;
  const summary = () => read<DashboardSummary>(`/api/dashboard/summary?${range}`);
  const setCost = (cost: number) =>
    env.DB.prepare("UPDATE products SET cost_price = ? WHERE id = ?").bind(cost, PEN).run();

  beforeEach(async () => {
    await create("import", PEN, 20);
  });

  it("counts confirmed sales at the price sold and the cost at that time", async () => {
    await create("export", PEN, 4);
    expect(await summary()).toMatchObject({ revenue: 20000, grossProfit: 8000, salesDocuments: 1 });
    await setCost(4000);
    expect(await summary()).toMatchObject({ revenue: 20000, grossProfit: 8000 });
    const charts = await read<DashboardCharts>(`/api/dashboard/charts?${range}`);
    expect(charts.sales.at(-1)).toEqual({ period: today, revenue: 20000, grossProfit: 8000 });
    expect(charts.sales).toHaveLength(7);
  });

  it("uses the cost when a draft is confirmed, not when it was written", async () => {
    const draft = await create("export", PEN, 2, false);
    expect(await summary()).toMatchObject({ revenue: 0, grossProfit: 0, salesDocuments: 0 });
    await setCost(4500);
    expect((await post(`/api/inventory/transactions/${draft.id}/confirm`)).status).toBe(200);
    expect(await summary()).toMatchObject({ revenue: 10000, grossProfit: 1000 });
  });

  it("leaves out reversed sales and exports to employees", async () => {
    const sold = await create("export", PEN, 3);
    const internal = { transactionDate: today, confirm: true, employeeId: EMPLOYEE, lines: [{ productId: PEN, quantity: 2 }] };
    expect((await post("/api/inventory/export", internal)).status).toBe(201);
    expect(await summary()).toMatchObject({ revenue: 15000, salesDocuments: 1 });
    await post(`/api/inventory/transactions/${sold.id}/reverse`, { reason: "Khách trả hàng" });
    expect(await summary()).toMatchObject({ revenue: 0, grossProfit: 0, salesDocuments: 0 });
  });

  it("reports a loss when goods are sold below cost", async () => {
    const body = { ...document(PEN, 1, true, 1000) };
    expect((await post("/api/inventory/export", body)).status).toBe(201);
    expect(await summary()).toMatchObject({ revenue: 1000, grossProfit: -2000 });
  });
});

describe("stock documents", () => {
  it("imports stock and fills the product's cost when no price is given", async () => {
    const doc = await create("import", PEN, 10);
    expect(doc).toMatchObject({ code: "PN-000001", status: "confirmed", totalAmount: 30000 });
    expect(doc.lines[0]).toMatchObject({ quantityDelta: 10, unitPrice: 3000, amount: 30000 });
    expect(await stock()).toBe(10);
  });

  it("exports stock at the sale price", async () => {
    await create("import", PEN, 10);
    const doc = await create("export", PEN, 4);
    expect(doc).toMatchObject({ code: "PX-000002", totalAmount: 20000 });
    expect(doc.lines[0]?.quantityDelta).toBe(-4);
    expect(await stock()).toBe(6);
  });

  it("adjusts stock in both directions and requires a reason", async () => {
    await create("import", PEN, 10);
    const body = { transactionDate: today, confirm: true, reason: "Kiểm kê", lines: [{ productId: PEN, delta: -3 }] };
    expect((await post("/api/inventory/adjust", body)).status).toBe(201);
    const up = { ...body, lines: [{ productId: PEN, delta: 1 }] };
    expect((await post("/api/inventory/adjust", up)).status).toBe(201);
    expect(await stock()).toBe(8);
    expect((await post("/api/inventory/adjust", { ...body, reason: "" })).status).toBe(422);
    const tooMuch = { ...body, lines: [{ productId: PEN, delta: -100 }] };
    expect((await post("/api/inventory/adjust", tooMuch)).status).toBe(409);
    expect(await stock()).toBe(8);
  });

  it("refuses to export more than is in stock", async () => {
    await create("import", PEN, 3);
    const response = await post("/api/inventory/export", document(PEN, 4));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "INSUFFICIENT_STOCK" } });
    expect(await stock()).toBe(3);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory_transactions").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("leaves stock alone for drafts until they are confirmed", async () => {
    const draft = await create("import", PEN, 7, false);
    expect(draft.status).toBe("draft");
    expect(await stock()).toBe(0);
    const edited = await api(`/api/inventory/import/${draft.id}`, {
      method: "PUT",
      cookie,
      body: document(PEN, 9, false),
    });
    expect(edited.status).toBe(200);
    expect(await stock()).toBe(0);
    expect((await post(`/api/inventory/transactions/${draft.id}/confirm`)).status).toBe(200);
    expect(await stock()).toBe(9);
    expect((await post(`/api/inventory/transactions/${draft.id}/confirm`)).status).toBe(409);
    expect(await stock()).toBe(9);
  });

  it("does not allow changing confirmed or cancelled documents", async () => {
    const confirmed = await create("import", PEN, 5);
    const edit = await api(`/api/inventory/import/${confirmed.id}`, {
      method: "PUT",
      cookie,
      body: document(PEN, 50),
    });
    expect(edit.status).toBe(409);
    expect((await post(`/api/inventory/transactions/${confirmed.id}/cancel`)).status).toBe(409);

    const draft = await create("import", PEN, 5, false);
    expect((await post(`/api/inventory/transactions/${draft.id}/cancel`)).status).toBe(200);
    expect((await post(`/api/inventory/transactions/${draft.id}/confirm`)).status).toBe(409);
    expect(await stock()).toBe(5);
  });

  it("reverses a confirmed document exactly once", async () => {
    const imported = await create("import", PEN, 5);
    const body = { reason: "Nhập nhầm" };
    const response = await post(`/api/inventory/transactions/${imported.id}/reverse`, body);
    expect(response.status).toBe(201);
    expect((await dataOf<InventoryTransactionDetail>(response)).reversedBy?.code).toBe("DN-000002");
    expect(await stock()).toBe(0);
    expect((await post(`/api/inventory/transactions/${imported.id}/reverse`, body)).status).toBe(409);
  });

  it("will not reverse an import whose stock has already left", async () => {
    const imported = await create("import", PEN, 5);
    await create("export", PEN, 4);
    const response = await post(`/api/inventory/transactions/${imported.id}/reverse`, { reason: "Sai" });
    expect(response.status).toBe(409);
    expect(await stock()).toBe(1);
  });

  it("rejects duplicates, future dates, unknown and retired products", async () => {
    const twice = { transactionDate: today, lines: [{ productId: PEN, quantity: 1 }, { productId: PEN, quantity: 2 }] };
    expect((await post("/api/inventory/import", twice)).status).toBe(422);
    const future = { ...document(PEN, 1), transactionDate: addDays(today, 1) };
    expect((await post("/api/inventory/import", future)).status).toBe(422);
    expect((await post("/api/inventory/import", document(999, 1))).status).toBe(422);
    await env.DB.prepare("UPDATE products SET status = 'discontinued' WHERE id = 1").run();
    expect((await post("/api/inventory/import", document(PEN, 1))).status).toBe(422);
  });

  it("handles a document with the maximum number of lines", async () => {
    const values = Array.from({ length: 50 }, (_, index) => {
      const id = index + 10;
      return `(${id}, 'S${id}', 'SP ${id}', 1, 'Cái')`;
    });
    await env.DB.prepare(`INSERT INTO products (id, sku, name, category_id, unit) VALUES ${values.join(",")}`).run();
    const lines = Array.from({ length: 50 }, (_, index) => ({ productId: index + 10, quantity: 2 }));
    const response = await post("/api/inventory/import", { transactionDate: today, confirm: true, lines });
    expect(response.status).toBe(201);
    expect((await dataOf<InventoryTransactionDetail>(response)).lineCount).toBe(50);
    expect(await stock(59)).toBe(2);
  });

  it("prevents overselling when two exports arrive together", async () => {
    await create("import", PEN, 5);
    const responses = await Promise.all([
      post("/api/inventory/export", document(PEN, 4)),
      post("/api/inventory/export", document(PEN, 4)),
      post("/api/inventory/export", document(PEN, 4)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409]);
    expect(await stock()).toBe(1);
    await expectLedgerMatchesBalances();
  });

  it("prevents overselling when two drafts are confirmed together", async () => {
    await create("import", PEN, 5);
    const first = await create("export", PEN, 4, false);
    const second = await create("export", PEN, 4, false);
    const responses = await Promise.all(
      [first, second].map((doc) => post(`/api/inventory/transactions/${doc.id}/confirm`)),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await stock()).toBe(1);
  });

  it("keeps balances equal to the ledger through a mixed history", async () => {
    const imported = await create("import", PEN, 20);
    await create("import", BOOK, 8);
    await create("export", PEN, 3);
    await create("export", BOOK, 8);
    await create("import", PEN, 2, false);
    const refused = await post(`/api/inventory/transactions/${imported.id}/reverse`, { reason: "Sai" });
    expect(refused.status).toBe(409);
    await expectLedgerMatchesBalances();
  });

  it("records an audit entry for each stock document", async () => {
    await create("import", PEN, 1);
    const row = await env.DB.prepare(
      "SELECT entity_id FROM audit_logs WHERE action = 'inventory.import'",
    ).first<{ entity_id: string }>();
    expect(row?.entity_id).toBe("1");
  });

  it("does not delete a product with stock history", async () => {
    await create("import", PEN, 1);
    const response = await api(`/api/products/${PEN}`, { method: "DELETE", cookie });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "PRODUCT_HAS_HISTORY" } });
  });

  it("lists documents with filters", async () => {
    await create("import", PEN, 5);
    await create("export", PEN, 1);
    await create("import", BOOK, 1, false);
    type Page = { pagination: { total: number } };
    expect((await read<Page>("/api/inventory/transactions?type=import")).pagination.total).toBe(2);
    expect((await read<Page>("/api/inventory/transactions?status=draft")).pagination.total).toBe(1);
    expect((await read<Page>(`/api/inventory/transactions?productId=${BOOK}`)).pagination.total).toBe(1);
    expect((await read<Page>("/api/inventory/transactions?search=PX-")).pagination.total).toBe(1);
    expect((await read<Page>("/api/inventory/balances?stockStatus=low_stock")).pagination.total).toBe(1);
  });
});

describe("dashboard", () => {
  const range = `from=${addDays(today, -6)}&to=${today}`;

  it("aggregates real totals", async () => {
    await create("import", PEN, 4);
    await create("import", BOOK, 10);
    await create("export", BOOK, 10);
    await create("import", BOOK, 1, false);
    const summary = await read<DashboardSummary>(`/api/dashboard/summary?${range}`);
    expect(summary).toMatchObject({
      employees: 2,
      customers: 1,
      products: 2,
      stockQuantity: 4,
      stockValue: 12000,
      lowStock: 1,
      outOfStock: 1,
      importTransactions: 2,
      exportTransactions: 1,
    });
    expect(summary.lowStockProducts.map((row) => row.sku)).toEqual(["BUT"]);
    expect(summary.outOfStockProducts.map((row) => row.sku)).toEqual(["SO"]);
    expect(summary.newCustomers).toHaveLength(1);
    expect(summary.recentTransactions).toHaveLength(3);
  });

  it("excludes soft-deleted records and reversed documents", async () => {
    const imported = await create("import", PEN, 4);
    await post(`/api/inventory/transactions/${imported.id}/reverse`, { reason: "Sai" });
    await env.DB.prepare("UPDATE employees SET deleted_at = 'x' WHERE code = 'NV1'").run();
    await env.DB.prepare("UPDATE products SET deleted_at = 'x' WHERE id = 2").run();
    const summary = await read<DashboardSummary>(`/api/dashboard/summary?${range}`);
    expect(summary).toMatchObject({ employees: 1, products: 1, stockQuantity: 0, importTransactions: 0 });
  });

  it("builds zero-filled series that end at the current stock", async () => {
    await create("import", PEN, 10);
    await create("export", PEN, 4);
    const imported = await create("import", BOOK, 3);
    await post(`/api/inventory/transactions/${imported.id}/reverse`, { reason: "Sai" });
    const charts = await read<DashboardCharts>(`/api/dashboard/charts?${range}`);
    expect(charts.series).toHaveLength(7);
    const last = charts.series.at(-1)!;
    expect(last).toMatchObject({ period: today, imported: 10, exported: 4, net: 6, stock: 6, value: 18000 });
    expect(charts.series[0]).toMatchObject({ imported: 0, stock: 0 });
    expect(charts.categories.find((row) => row.id === 1)).toMatchObject({ products: 1, quantity: 6, value: 18000 });
  });

  it("leaves reversed documents out of the in and out totals", async () => {
    await create("import", PEN, 5);
    const exported = await create("export", PEN, 2);
    await post(`/api/inventory/transactions/${exported.id}/reverse`, { reason: "Sai" });
    const charts = await read<DashboardCharts>(`/api/dashboard/charts?${range}`);
    expect(charts.series.at(-1)).toMatchObject({ imported: 5, exported: 0, net: 5, stock: 5 });
  });

  it("carries earlier movements into the opening balance and groups long ranges", async () => {
    await create("import", PEN, 10);
    const tomorrow = addDays(today, 1);
    const empty = await read<DashboardCharts>(`/api/dashboard/charts?from=${tomorrow}&to=${tomorrow}`);
    expect(empty.series[0]).toMatchObject({ imported: 0, stock: 10 });
    const long = await read<DashboardCharts>(`/api/dashboard/charts?from=${addDays(today, -200)}&to=${today}`);
    expect(long.series.at(-1)?.period).toBe(today.slice(0, 7));
    expect(long.series.length).toBeLessThan(9);
  });

  it("rejects invalid or oversized ranges", async () => {
    expect((await api(`/api/dashboard/summary?from=${today}&to=${addDays(today, -1)}`, { cookie })).status).toBe(422);
    expect((await api(`/api/dashboard/charts?from=${addDays(today, -400)}&to=${today}`, { cookie })).status).toBe(422);
    expect((await api("/api/dashboard/charts?from=abc", { cookie })).status).toBe(422);
  });
});

describe("reports", () => {
  const range = `from=${addDays(today, -6)}&to=${today}`;

  it("summarises people", async () => {
    expect(await read(`/api/reports/employees?${range}`)).toMatchObject({ total: 2, active: 1, resigned: 1 });
    expect(await read(`/api/reports/customers?${range}`)).toMatchObject({
      total: 1,
      individual: 1,
      business: 0,
      newInRange: 1,
    });
  });

  it("filters product and inventory reports", async () => {
    await create("import", PEN, 10);
    await create("import", BOOK, 1);
    await create("export", PEN, 2);
    const byCategory = await read<ProductReport>("/api/reports/products?categoryId=2");
    expect(byCategory).toMatchObject({ total: 1, lowStock: 1 });
    expect(byCategory.categories).toHaveLength(1);

    const all = await read<InventoryReport>(`/api/reports/inventory?${range}`);
    expect(all).toMatchObject({ imported: 11, exported: 2, stockQuantity: 9, stockValue: 34000 });
    expect(all.history.total).toBe(3);
    const pen = await read<InventoryReport>(`/api/reports/inventory?${range}&productId=${PEN}`);
    expect(pen).toMatchObject({ imported: 10, exported: 2, stockQuantity: 8 });
    const books = await read<InventoryReport>(`/api/reports/inventory?${range}&categoryId=2`);
    expect(books.history.items.map((row) => row.sku)).toEqual(["SO"]);
  });

  it.each(["employees", "customers", "products", "inventory"])("exports %s as CSV", async (kind) => {
    await create("import", PEN, 1);
    const response = await api(`/api/reports/${kind}/export?${range}`, { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect((await response.text()).split("\r\n").length).toBeGreaterThan(2);
  });
});
