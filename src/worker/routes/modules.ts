import { Hono } from "hono";
import {
  categorySchema,
  customerListQuery,
  customerNoteSchema,
  customerSchema,
  employeeListQuery,
  employeeSchema,
  productListQuery,
  productSchema,
} from "@shared/validation/entities";
import { settingsSchema } from "@shared/validation/reports";
import { createDb } from "../../db/client";
import type { AppEnv } from "../env";
import { ok, parseJson } from "../lib/http";
import { parseId, resourceRoutes } from "../lib/resource-routes";
import {
  CUSTOMER_EXPORT,
  addCustomerNote,
  createCustomer,
  deleteCustomer,
  deleteCustomerNote,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../services/customers";
import {
  EMPLOYEE_EXPORT,
  createEmployee,
  deleteEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
} from "../services/employees";
import {
  PRODUCT_COST_HEADER,
  PRODUCT_EXPORT,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
} from "../services/products";
import { getSettings, saveSettings } from "../services/settings";
import { canSeeCostPrice } from "@shared/permissions";
import { maskProduct, withoutCostSort } from "../lib/cost-visibility";

export const employeeRoutes = resourceRoutes({
  querySchema: employeeListQuery,
  bodySchema: employeeSchema,
  exportName: "nhan-vien",
  sheetName: "Nhân viên",
  columns: EMPLOYEE_EXPORT,
  list: listEmployees,
  get: getEmployee,
  create: createEmployee,
  update: updateEmployee,
  remove: deleteEmployee,
});

export const customerRoutes = resourceRoutes({
  querySchema: customerListQuery,
  bodySchema: customerSchema,
  exportName: "khach-hang",
  sheetName: "Khách hàng",
  columns: CUSTOMER_EXPORT,
  list: listCustomers,
  get: getCustomer,
  create: createCustomer,
  update: updateCustomer,
  remove: deleteCustomer,
})
  .post("/:id{[0-9]+}/notes", async (c) => {
    const { content } = await parseJson(c, customerNoteSchema);
    const note = await addCustomerNote(createDb(c.env.DB), c.get("admin"), parseId(c), content);
    return ok(c, note, 201);
  })
  .delete("/:id{[0-9]+}/notes/:noteId{[0-9]+}", async (c) => {
    await deleteCustomerNote(createDb(c.env.DB), c.get("admin"), parseId(c), parseId(c, "noteId"));
    return ok(c, null);
  });

/** Sản phẩm: Nhân viên chỉ xem và không thấy giá nhập (ghi bị chặn bởi catalogGuard ở app.ts). */
export const productRoutes = resourceRoutes({
  querySchema: productListQuery,
  bodySchema: productSchema,
  exportName: "san-pham",
  sheetName: "Sản phẩm",
  columns: (actor) => (canSeeCostPrice(actor.role) ? PRODUCT_EXPORT : PRODUCT_EXPORT.filter((column) => column.header !== PRODUCT_COST_HEADER)),
  list: async (db, query, actor) => {
    const page = await listProducts(db, withoutCostSort(actor, query));
    return { ...page, items: page.items.map((product) => maskProduct(actor, product)) };
  },
  get: async (db, id, actor) => maskProduct(actor, await getProduct(db, id)),
  create: createProduct,
  update: updateProduct,
  remove: deleteProduct,
});

export const categoryRoutes = new Hono<AppEnv>()
  .get("/", async (c) => ok(c, await listCategories(createDb(c.env.DB))))
  .post("/", async (c) => {
    const input = await parseJson(c, categorySchema);
    return ok(c, await createCategory(createDb(c.env.DB), c.get("admin"), input), 201);
  })
  .put("/:id{[0-9]+}", async (c) => {
    const input = await parseJson(c, categorySchema);
    return ok(c, await updateCategory(createDb(c.env.DB), c.get("admin"), parseId(c), input));
  })
  .delete("/:id{[0-9]+}", async (c) => {
    await deleteCategory(createDb(c.env.DB), c.get("admin"), parseId(c));
    return ok(c, null);
  });

export const settingsRoutes = new Hono<AppEnv>()
  .get("/", async (c) => ok(c, await getSettings(createDb(c.env.DB))))
  .put("/", async (c) => {
    const input = await parseJson(c, settingsSchema);
    return ok(c, await saveSettings(createDb(c.env.DB), c.get("admin"), input));
  });
