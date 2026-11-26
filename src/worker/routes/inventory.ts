import { Hono, type Context } from "hono";
import { productListQuery } from "@shared/validation/entities";
import {
  adjustSchema,
  exportSchema,
  importSchema,
  reverseSchema,
  transactionListQuery,
} from "@shared/validation/inventory";
import { createDb } from "../../db/client";
import type { AppEnv } from "../env";
import { MAX_EXPORT_ROWS, excelResponse } from "../lib/export";
import { ok, parseJson } from "../lib/http";
import { parseId, parseQuery } from "../lib/resource-routes";
import {
  TRANSACTION_EXPORT,
  cancelTransaction,
  confirmTransaction,
  createDocument,
  getTransaction,
  listTransactions,
  reverseTransaction,
  toDocument,
  updateDraft,
} from "../services/inventory";
import { listProducts } from "../services/products";
import { canImportStock } from "@shared/permissions";
import { ApiError } from "../lib/errors";
import type { InventoryTransactionDetail } from "@shared/types";
import { maskProduct, maskTransaction, withoutCostSort } from "../lib/cost-visibility";

const context = (c: Context<AppEnv>) => ({ db: createDb(c.env.DB), actor: c.get("admin") });

/** Mọi phiếu trả về đi qua đây để ẩn giá nhập với Nhân viên. */
const sendDocument = async (c: Context<AppEnv>, document: Promise<InventoryTransactionDetail>, status: 200 | 201 = 200) =>
  ok(c, maskTransaction(c.get("admin"), await document), status);

const importForbidden = () =>
  new ApiError(403, "FORBIDDEN", "Nhân viên không được nhập kho (đơn giá phiếu nhập là giá nhập)");

/** Tạo / sửa phiếu nhập: chỉ vai trò được nhập kho. */
async function importInput(c: Context<AppEnv>) {
  if (!canImportStock(c.get("admin").role)) throw importForbidden();
  return toDocument.import(await parseJson(c, importSchema));
}

/** Xác nhận / hủy / đảo ngược: nếu là phiếu nhập thì cũng chỉ vai trò được nhập kho. */
async function assertMayHandle(c: Context<AppEnv>, id: number) {
  if (canImportStock(c.get("admin").role)) return;
  const document = await getTransaction(createDb(c.env.DB), id);
  if (document.type === "import") throw importForbidden();
}

export const inventoryRoutes = new Hono<AppEnv>()
  .get("/balances", async (c) => {
    const page = await listProducts(createDb(c.env.DB), withoutCostSort(c.get("admin"), parseQuery(c, productListQuery)));
    return ok(c, { ...page, items: page.items.map((product) => maskProduct(c.get("admin"), product)) });
  })
  .get("/transactions", async (c) => {
    const page = await listTransactions(createDb(c.env.DB), parseQuery(c, transactionListQuery));
    return ok(c, { ...page, items: page.items.map((row) => maskTransaction(c.get("admin"), row)) });
  })
  .get("/transactions/export", async (c) => {
    const query = { ...parseQuery(c, transactionListQuery), page: 1, pageSize: MAX_EXPORT_ROWS };
    const { items, pagination } = await listTransactions(createDb(c.env.DB), query);
    return excelResponse(c, {
      fileName: "phieu-kho",
      sheetName: "Phiếu kho",
      columns: TRANSACTION_EXPORT,
      rows: items.map((row) => maskTransaction(c.get("admin"), row)),
      total: pagination.total,
    });
  })
  .get("/transactions/:id{[0-9]+}", async (c) => sendDocument(c, getTransaction(createDb(c.env.DB), parseId(c))))
  .post("/transactions/:id{[0-9]+}/confirm", async (c) => {
    const { db, actor } = context(c);
    await assertMayHandle(c, parseId(c));
    return sendDocument(c, confirmTransaction(db, actor, parseId(c)));
  })
  .post("/transactions/:id{[0-9]+}/cancel", async (c) => {
    const { db, actor } = context(c);
    await assertMayHandle(c, parseId(c));
    return sendDocument(c, cancelTransaction(db, actor, parseId(c)));
  })
  .post("/transactions/:id{[0-9]+}/reverse", async (c) => {
    await assertMayHandle(c, parseId(c));
    const { reason } = await parseJson(c, reverseSchema);
    const { db, actor } = context(c);
    return sendDocument(c, reverseTransaction(db, actor, parseId(c), reason), 201);
  })
  .post("/import", async (c) => {
    const input = await importInput(c);
    const { db, actor } = context(c);
    return sendDocument(c, createDocument(db, actor, "import", input), 201);
  })
  .post("/export", async (c) => {
    const input = toDocument.export(await parseJson(c, exportSchema));
    const { db, actor } = context(c);
    return sendDocument(c, createDocument(db, actor, "export", input), 201);
  })
  .post("/adjust", async (c) => {
    const input = toDocument.adjust(await parseJson(c, adjustSchema));
    const { db, actor } = context(c);
    return sendDocument(c, createDocument(db, actor, "adjust", input), 201);
  })
  .put("/import/:id{[0-9]+}", async (c) => {
    const input = await importInput(c);
    const { db, actor } = context(c);
    return sendDocument(c, updateDraft(db, actor, parseId(c), "import", input));
  })
  .put("/export/:id{[0-9]+}", async (c) => {
    const input = toDocument.export(await parseJson(c, exportSchema));
    const { db, actor } = context(c);
    return sendDocument(c, updateDraft(db, actor, parseId(c), "export", input));
  })
  .put("/adjust/:id{[0-9]+}", async (c) => {
    const input = toDocument.adjust(await parseJson(c, adjustSchema));
    const { db, actor } = context(c);
    return sendDocument(c, updateDraft(db, actor, parseId(c), "adjust", input));
  });
