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

const context = (c: Context<AppEnv>) => ({ db: createDb(c.env.DB), actor: c.get("admin") });

export const inventoryRoutes = new Hono<AppEnv>()
  .get("/balances", async (c) =>
    ok(c, await listProducts(createDb(c.env.DB), parseQuery(c, productListQuery))),
  )
  .get("/transactions", async (c) =>
    ok(c, await listTransactions(createDb(c.env.DB), parseQuery(c, transactionListQuery))),
  )
  .get("/transactions/export", async (c) => {
    const query = { ...parseQuery(c, transactionListQuery), page: 1, pageSize: MAX_EXPORT_ROWS };
    const { items, pagination } = await listTransactions(createDb(c.env.DB), query);
    return excelResponse(c, {
      fileName: "phieu-kho",
      sheetName: "Phiếu kho",
      columns: TRANSACTION_EXPORT,
      rows: items,
      total: pagination.total,
    });
  })
  .get("/transactions/:id{[0-9]+}", async (c) =>
    ok(c, await getTransaction(createDb(c.env.DB), parseId(c))),
  )
  .post("/transactions/:id{[0-9]+}/confirm", async (c) => {
    const { db, actor } = context(c);
    return ok(c, await confirmTransaction(db, actor, parseId(c)));
  })
  .post("/transactions/:id{[0-9]+}/cancel", async (c) => {
    const { db, actor } = context(c);
    return ok(c, await cancelTransaction(db, actor, parseId(c)));
  })
  .post("/transactions/:id{[0-9]+}/reverse", async (c) => {
    const { reason } = await parseJson(c, reverseSchema);
    const { db, actor } = context(c);
    return ok(c, await reverseTransaction(db, actor, parseId(c), reason), 201);
  })
  .post("/import", async (c) => {
    const input = toDocument.import(await parseJson(c, importSchema));
    const { db, actor } = context(c);
    return ok(c, await createDocument(db, actor, "import", input), 201);
  })
  .post("/export", async (c) => {
    const input = toDocument.export(await parseJson(c, exportSchema));
    const { db, actor } = context(c);
    return ok(c, await createDocument(db, actor, "export", input), 201);
  })
  .post("/adjust", async (c) => {
    const input = toDocument.adjust(await parseJson(c, adjustSchema));
    const { db, actor } = context(c);
    return ok(c, await createDocument(db, actor, "adjust", input), 201);
  })
  .put("/import/:id{[0-9]+}", async (c) => {
    const input = toDocument.import(await parseJson(c, importSchema));
    const { db, actor } = context(c);
    return ok(c, await updateDraft(db, actor, parseId(c), "import", input));
  })
  .put("/export/:id{[0-9]+}", async (c) => {
    const input = toDocument.export(await parseJson(c, exportSchema));
    const { db, actor } = context(c);
    return ok(c, await updateDraft(db, actor, parseId(c), "export", input));
  })
  .put("/adjust/:id{[0-9]+}", async (c) => {
    const input = toDocument.adjust(await parseJson(c, adjustSchema));
    const { db, actor } = context(c);
    return ok(c, await updateDraft(db, actor, parseId(c), "adjust", input));
  });
