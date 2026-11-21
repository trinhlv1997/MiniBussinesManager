import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const db = env.DB;
const PRODUCT = 1;
const OTHER_PRODUCT = 2;
let nextTransactionId = 1;

const run = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values).run();

async function balance(productId = PRODUCT) {
  const row = await db
    .prepare("SELECT quantity FROM inventory_balances WHERE product_id = ?")
    .bind(productId)
    .first<{ quantity: number }>();
  return row?.quantity;
}

async function ledger(productId = PRODUCT) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(i.quantity_delta), 0) AS total
       FROM inventory_transaction_items i
       JOIN inventory_transactions t ON t.id = i.transaction_id
       WHERE i.product_id = ? AND t.status = 'confirmed'`,
    )
    .bind(productId)
    .first<{ total: number }>();
  return row?.total;
}

async function draft(
  type: "import" | "export" | "adjust",
  lines: [productId: number, delta: number][],
) {
  const id = nextTransactionId++;
  await run(
    `INSERT INTO inventory_transactions (id, code, type, transaction_date, reason)
     VALUES (?, ?, ?, '2026-11-18', ?)`,
    id,
    `PK-${id}`,
    type,
    type === "adjust" ? "Kiểm kê" : null,
  );
  for (const [productId, delta] of lines) {
    await run(
      `INSERT INTO inventory_transaction_items (transaction_id, product_id, quantity_delta)
       VALUES (?, ?, ?)`,
      id,
      productId,
      delta,
    );
  }
  return id;
}

const confirmStatement = (id: number) =>
  db
    .prepare(
      `UPDATE inventory_transactions
       SET status = 'confirmed', confirmed_at = '2026-11-18T00:00:00.000Z'
       WHERE id = ? AND status = 'draft'`,
    )
    .bind(id);

const confirm = (id: number) => confirmStatement(id).run();

beforeEach(async () => {
  nextTransactionId = 1;
  await run("INSERT INTO product_categories (id, code, name) VALUES (1, 'DM01', 'Văn phòng phẩm')");
  await run(
    `INSERT INTO products (id, sku, name, category_id, unit)
     VALUES (1, 'SP01', 'Bút bi', 1, 'Cái'), (2, 'SP02', 'Sổ tay', 1, 'Cuốn')`,
  );
});

describe("inventory database rules", () => {
  it("creates a zero balance for every new product", async () => {
    expect(await balance()).toBe(0);
    expect(await balance(OTHER_PRODUCT)).toBe(0);
  });

  it("keeps stock unchanged while a document is a draft", async () => {
    await draft("import", [[PRODUCT, 10]]);
    expect(await balance()).toBe(0);
  });

  it("applies stock when a document is confirmed, only once", async () => {
    const id = await draft("import", [[PRODUCT, 10], [OTHER_PRODUCT, 4]]);
    await confirm(id);
    const second = await confirm(id);
    expect(second.meta.changes).toBe(0);
    expect(await balance()).toBe(10);
    expect(await balance(OTHER_PRODUCT)).toBe(4);
  });

  it("supports exports and signed adjustments", async () => {
    await confirm(await draft("import", [[PRODUCT, 10]]));
    await confirm(await draft("export", [[PRODUCT, -3]]));
    await confirm(await draft("adjust", [[PRODUCT, -2]]));
    await confirm(await draft("adjust", [[PRODUCT, 1]]));
    expect(await balance()).toBe(6);
    expect(await ledger()).toBe(6);
  });

  it("rejects an export above stock and rolls back every line", async () => {
    await confirm(await draft("import", [[PRODUCT, 5], [OTHER_PRODUCT, 5]]));
    const id = await draft("export", [[PRODUCT, -1], [OTHER_PRODUCT, -6]]);
    await expect(confirm(id)).rejects.toThrow(/CHECK constraint/);

    expect(await balance()).toBe(5);
    expect(await balance(OTHER_PRODUCT)).toBe(5);
    const row = await db
      .prepare("SELECT status FROM inventory_transactions WHERE id = ?")
      .bind(id)
      .first<{ status: string }>();
    expect(row?.status).toBe("draft");
  });

  it("lets only one of two simultaneous exports through", async () => {
    await confirm(await draft("import", [[PRODUCT, 5]]));
    const first = await draft("export", [[PRODUCT, -4]]);
    const second = await draft("export", [[PRODUCT, -4]]);

    const results = await Promise.allSettled([confirm(first), confirm(second)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await balance()).toBe(1);
    expect(await ledger()).toBe(1);
  });

  it("makes confirmed documents and their lines immutable", async () => {
    const id = await draft("import", [[PRODUCT, 5]]);
    await confirm(id);
    const locked = /INVENTORY_TRANSACTION_LOCKED/;

    await expect(run("UPDATE inventory_transactions SET note = 'sửa' WHERE id = ?", id)).rejects.toThrow(locked);
    await expect(run("DELETE FROM inventory_transactions WHERE id = ?", id)).rejects.toThrow(locked);
    await expect(run("UPDATE inventory_transaction_items SET quantity_delta = 9")).rejects.toThrow(locked);
    await expect(run("DELETE FROM inventory_transaction_items")).rejects.toThrow(locked);
    await expect(
      run(
        "INSERT INTO inventory_transaction_items (transaction_id, product_id, quantity_delta) VALUES (?, 2, 1)",
        id,
      ),
    ).rejects.toThrow(locked);
  });

  it("corrects a confirmed document through a linked reversal", async () => {
    const original = await draft("import", [[PRODUCT, 5]]);
    await confirm(original);
    await run(
      `INSERT INTO inventory_transactions (id, code, type, transaction_date, reversal_of_id)
       VALUES (50, 'DN-1', 'reversal', '2026-11-18', ?)`,
      original,
    );
    await run(
      "INSERT INTO inventory_transaction_items (transaction_id, product_id, quantity_delta) VALUES (50, 1, -5)",
    );
    await confirm(50);
    expect(await balance()).toBe(0);
    await expect(
      run(
        `INSERT INTO inventory_transactions (id, code, type, transaction_date, reversal_of_id)
         VALUES (51, 'DN-2', 'reversal', '2026-11-18', ?)`,
        original,
      ),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("refuses direct balance edits that disagree with the ledger", async () => {
    await confirm(await draft("import", [[PRODUCT, 5]]));
    await expect(run("UPDATE inventory_balances SET quantity = 99 WHERE product_id = 1")).rejects.toThrow(
      /INVENTORY_BALANCE_MISMATCH/,
    );
    expect(await balance()).toBe(5);
  });

  it("enforces movement direction, non-empty documents and draft creation", async () => {
    await expect(draft("import", [[PRODUCT, -1]])).rejects.toThrow(/INVENTORY_INVALID_DIRECTION/);
    await expect(draft("export", [[PRODUCT, 1]])).rejects.toThrow(/INVENTORY_INVALID_DIRECTION/);
    await expect(confirm(await draft("import", []))).rejects.toThrow(/INVENTORY_EMPTY_TRANSACTION/);
    await expect(
      run(
        `INSERT INTO inventory_transactions (code, type, status, transaction_date)
         VALUES ('PK-X', 'import', 'confirmed', '2026-11-18')`,
      ),
    ).rejects.toThrow(/INVENTORY_MUST_START_AS_DRAFT/);
  });

  it("does not allow deleting a product that has stock history", async () => {
    await draft("import", [[PRODUCT, 1]]);
    await expect(run("DELETE FROM products WHERE id = 1")).rejects.toThrow(/FOREIGN KEY/);
  });
});
