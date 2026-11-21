import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

/** Attempts to get around the ledger rules with statements that look valid. */
const db = env.DB;
const PRODUCT = 1;
const CONFIRMED_AT = "2026-11-18T00:00:00.000Z";
let nextId = 1;

const run = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values).run();

async function createDocument(type: string, reversalOf: number | null = null) {
  const id = nextId++;
  await run(
    `INSERT INTO inventory_transactions (id, code, type, transaction_date, reason, reversal_of_id)
     VALUES (?, ?, ?, '2026-11-18', ?, ?)`,
    id,
    `PK-${id}`,
    type,
    type === "adjust" ? "Kiểm kê" : null,
    reversalOf,
  );
  return id;
}

const addLine = (transactionId: number, delta: unknown, productId = PRODUCT, price: unknown = null) =>
  run(
    `INSERT INTO inventory_transaction_items (transaction_id, product_id, quantity_delta, unit_price)
     VALUES (?, ?, ?, ?)`,
    transactionId,
    productId,
    delta,
    price,
  );

const confirm = (id: number) =>
  run(
    "UPDATE inventory_transactions SET status = 'confirmed', confirmed_at = ? WHERE id = ?",
    CONFIRMED_AT,
    id,
  );

async function confirmedImport(quantity: number) {
  const id = await createDocument("import");
  await addLine(id, quantity);
  await confirm(id);
  return id;
}

async function balance(productId = PRODUCT) {
  const row = await db
    .prepare("SELECT quantity FROM inventory_balances WHERE product_id = ?")
    .bind(productId)
    .first<{ quantity: number }>();
  return row?.quantity;
}

beforeEach(async () => {
  nextId = 1;
  await run("INSERT INTO product_categories (id, code, name) VALUES (1, 'DM01', 'Văn phòng phẩm')");
  await run(
    `INSERT INTO products (id, sku, name, category_id, unit)
     VALUES (1, 'SP01', 'Bút bi', 1, 'Cái'), (2, 'SP02', 'Sổ tay', 1, 'Cuốn')`,
  );
});

describe("document identity", () => {
  it("does not let a draft change type after its lines were validated", async () => {
    const id = await createDocument("import");
    await addLine(id, 5);
    await expect(run("UPDATE inventory_transactions SET type = 'export' WHERE id = ?", id)).rejects.toThrow(
      /INVENTORY_TYPE_LOCKED/,
    );
  });

  it("requires a confirmation time so every stock change is traceable", async () => {
    const id = await createDocument("import");
    await addLine(id, 5);
    await expect(run("UPDATE inventory_transactions SET status = 'confirmed' WHERE id = ?", id)).rejects.toThrow(
      /INVENTORY_CONFIRMED_AT_REQUIRED/,
    );
    expect(await balance()).toBe(0);
  });
});

describe("reversals", () => {
  it("must cancel the original exactly", async () => {
    const original = await confirmedImport(5);
    const reversal = await createDocument("reversal", original);
    await addLine(reversal, -2);
    await expect(confirm(reversal)).rejects.toThrow(/INVENTORY_INVALID_REVERSAL/);
    expect(await balance()).toBe(5);
  });

  it("cannot touch a product the original did not move", async () => {
    const original = await confirmedImport(5);
    const reversal = await createDocument("reversal", original);
    await addLine(reversal, -5);
    await addLine(reversal, 3, 2);
    await expect(confirm(reversal)).rejects.toThrow(/INVENTORY_INVALID_REVERSAL/);
  });

  it("can only target a confirmed, non-reversal document", async () => {
    const unconfirmed = await createDocument("import");
    await addLine(unconfirmed, 5);
    const ofDraft = await createDocument("reversal", unconfirmed);
    await addLine(ofDraft, -5);
    await expect(confirm(ofDraft)).rejects.toThrow(/INVENTORY_INVALID_REVERSAL/);

    const original = await confirmedImport(5);
    const reversal = await createDocument("reversal", original);
    await addLine(reversal, -5);
    await confirm(reversal);
    const ofReversal = await createDocument("reversal", reversal);
    await addLine(ofReversal, 5);
    await expect(confirm(ofReversal)).rejects.toThrow(/INVENTORY_INVALID_REVERSAL/);
  });
});

describe("balance rows", () => {
  it("cannot be deleted while the product exists", async () => {
    await confirmedImport(5);
    await expect(run("DELETE FROM inventory_balances WHERE product_id = 1")).rejects.toThrow(
      /INVENTORY_BALANCE_PROTECTED/,
    );
    expect(await balance()).toBe(5);
  });

  it("cannot be moved to another product", async () => {
    await run("DELETE FROM products WHERE id = 2");
    await expect(run("UPDATE inventory_balances SET product_id = 2 WHERE product_id = 1")).rejects.toThrow(
      /INVENTORY_BALANCE_PROTECTED/,
    );
  });

  it("still disappears with a product that has no history", async () => {
    await run("DELETE FROM products WHERE id = 2");
    expect(await balance(2)).toBeUndefined();
  });
});

describe("whole-number values", () => {
  it.each([[1.5], ["nhiều"]])("rejects the stock quantity %s", async (delta) => {
    const id = await createDocument("import");
    await expect(addLine(id, delta)).rejects.toThrow(/INVENTORY_INVALID_NUMBER/);
  });

  it("rejects a fractional line price, also on update", async () => {
    const id = await createDocument("import");
    await expect(addLine(id, 1, PRODUCT, 1000.5)).rejects.toThrow(/INVENTORY_INVALID_NUMBER/);
    await addLine(id, 1, PRODUCT, 1000);
    await expect(run("UPDATE inventory_transaction_items SET quantity_delta = 2.5")).rejects.toThrow(
      /INVENTORY_INVALID_NUMBER/,
    );
  });

  it.each(["cost_price", "sale_price", "min_stock"])("rejects a fractional %s", async (column) => {
    await expect(run(`UPDATE products SET ${column} = 10.5 WHERE id = 1`)).rejects.toThrow(
      /PRODUCT_INVALID_NUMBER/,
    );
    await expect(
      run(
        `INSERT INTO products (id, sku, name, category_id, unit, ${column})
         VALUES (3, 'SP03', 'Thước kẻ', 1, 'Cái', 10.5)`,
      ),
    ).rejects.toThrow(/PRODUCT_INVALID_NUMBER/);
  });
});

describe("soft-deleted products", () => {
  it("cannot hide a product that has stock history", async () => {
    await confirmedImport(5);
    await expect(run("UPDATE products SET deleted_at = ? WHERE id = 1", CONFIRMED_AT)).rejects.toThrow(
      /PRODUCT_HAS_INVENTORY_HISTORY/,
    );
  });

  it("cannot be added to a document", async () => {
    await run("UPDATE products SET deleted_at = ? WHERE id = 2", CONFIRMED_AT);
    const id = await createDocument("import");
    await expect(addLine(id, 1, 2)).rejects.toThrow(/INVENTORY_PRODUCT_DELETED/);
  });
});
