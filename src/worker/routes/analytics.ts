import { Hono } from "hono";
import { formatDate } from "@shared/format";
import { TRANSACTION_TYPE_LABELS } from "@shared/labels";
import type { InventoryHistoryRow } from "@shared/types";
import { dateRangeQuery } from "@shared/validation/common";
import {
  customerListQuery,
  employeeListQuery,
  productListQuery,
} from "@shared/validation/entities";
import { reportQuery } from "@shared/validation/reports";
import { createDb } from "../../db/client";
import type { AppEnv } from "../env";
import { MAX_EXPORT_ROWS, csvResponse, type CsvColumn } from "../lib/csv";
import { readBatch } from "../lib/db";
import { ok } from "../lib/http";
import { parseQuery } from "../lib/resource-routes";
import {
  getCustomerReport,
  getDashboardCharts,
  getDashboardSummary,
  getEmployeeReport,
  getInventoryReport,
  getProductReport,
  inventoryHistoryCount,
  inventoryHistoryQuery,
} from "../services/analytics";
import { CUSTOMER_CSV, listCustomers } from "../services/customers";
import { EMPLOYEE_CSV, listEmployees } from "../services/employees";
import { PRODUCT_CSV, listProducts } from "../services/products";

const EXPORT_PAGE = { page: 1, pageSize: MAX_EXPORT_ROWS };

const HISTORY_CSV: CsvColumn<InventoryHistoryRow>[] = [
  { header: "Ngày", value: (row) => formatDate(row.transactionDate) },
  { header: "Mã phiếu", value: (row) => row.code },
  { header: "Loại phiếu", value: (row) => TRANSACTION_TYPE_LABELS[row.type] },
  { header: "Mã SKU", value: (row) => row.sku },
  { header: "Sản phẩm", value: (row) => row.productName },
  { header: "Danh mục", value: (row) => row.categoryName },
  { header: "Đơn vị tính", value: (row) => row.unit },
  { header: "Thay đổi số lượng", value: (row) => row.quantityDelta },
  { header: "Đơn giá (VND)", value: (row) => row.unitPrice },
  { header: "Tham chiếu", value: (row) => row.reference },
];

export const dashboardRoutes = new Hono<AppEnv>()
  .get("/summary", async (c) =>
    ok(c, await getDashboardSummary(createDb(c.env.DB), parseQuery(c, dateRangeQuery))),
  )
  .get("/charts", async (c) =>
    ok(c, await getDashboardCharts(createDb(c.env.DB), parseQuery(c, dateRangeQuery))),
  );

export const reportRoutes = new Hono<AppEnv>()
  .get("/employees", async (c) =>
    ok(c, await getEmployeeReport(createDb(c.env.DB), parseQuery(c, dateRangeQuery))),
  )
  .get("/customers", async (c) =>
    ok(c, await getCustomerReport(createDb(c.env.DB), parseQuery(c, dateRangeQuery))),
  )
  .get("/products", async (c) =>
    ok(c, await getProductReport(createDb(c.env.DB), parseQuery(c, reportQuery))),
  )
  .get("/inventory", async (c) =>
    ok(c, await getInventoryReport(createDb(c.env.DB), parseQuery(c, reportQuery))),
  )
  .get("/employees/export", async (c) => {
    const query = { ...employeeListQuery.parse({}), ...EXPORT_PAGE };
    const { items, pagination } = await listEmployees(createDb(c.env.DB), query);
    return csvResponse(c, "bao-cao-nhan-vien", EMPLOYEE_CSV, items, pagination.total);
  })
  .get("/customers/export", async (c) => {
    const { from, to } = parseQuery(c, dateRangeQuery);
    const query = {
      ...customerListQuery.parse({}),
      ...EXPORT_PAGE,
      createdFrom: from,
      createdTo: to,
    };
    const { items, pagination } = await listCustomers(createDb(c.env.DB), query);
    return csvResponse(c, "bao-cao-khach-hang", CUSTOMER_CSV, items, pagination.total);
  })
  .get("/products/export", async (c) => {
    const { categoryId } = parseQuery(c, reportQuery);
    const query = { ...productListQuery.parse({}), ...EXPORT_PAGE, categoryId };
    const { items, pagination } = await listProducts(createDb(c.env.DB), query);
    return csvResponse(c, "bao-cao-san-pham", PRODUCT_CSV, items, pagination.total);
  })
  .get("/inventory/export", async (c) => {
    const db = createDb(c.env.DB);
    const query = parseQuery(c, reportQuery);
    const [rows, count] = (await readBatch(db, [
      inventoryHistoryQuery(db, query, MAX_EXPORT_ROWS, 0),
      inventoryHistoryCount(db, query),
    ])) as [InventoryHistoryRow[], { total: number }[]];
    return csvResponse(c, "bao-cao-kho", HISTORY_CSV, rows, count[0]?.total ?? 0);
  });
