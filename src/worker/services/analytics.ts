import { type SQL, sql } from "drizzle-orm";
import { addDays, daysBetween, vnDayEndUtc, vnDayStartUtc } from "@shared/format";
import type {
  CategoryStock,
  CountPoint,
  CustomerReport,
  DashboardCharts,
  DashboardSummary,
  EmployeeReport,
  InventoryHistoryRow,
  InventoryReport,
  ProductReport,
  SalesPoint,
  StockAlertProduct,
  StockPoint,
} from "@shared/types";
import type { DateRange, ReportQuery } from "@shared/validation/reports";
import type { Db } from "../../db/client";
import { rawQuery, readBatch } from "../lib/db";

/** Longer ranges are shown per month so charts stay readable. */
const MAX_DAILY_POINTS = 92;
const ALERT_LIST_SIZE = 8;
const REPORT_LIST_SIZE = 50;

type Movement = {
  day: string;
  imported: number;
  exported: number;
  adjusted: number;
  net: number;
  netValue: number;
};
type Filter = { productId?: number; categoryId?: number };
type Totals = { quantity: number; value: number };

function ledgerFilter({ productId, categoryId }: Filter): SQL {
  const parts = [sql`t.status = 'confirmed'`];
  if (productId) parts.push(sql`i.product_id = ${productId}`);
  if (categoryId) parts.push(sql`p.category_id = ${categoryId}`);
  return sql.join(parts, sql` AND `);
}

const LEDGER_FROM = sql`
  inventory_transaction_items i
  JOIN inventory_transactions t ON t.id = i.transaction_id
  JOIN products p ON p.id = i.product_id`;

/**
 * Reversed documents and their reversals are left out of the in and out totals, as if
 * they never happened. They still count towards stock, where they cancel each other.
 */
const movementQuery = (db: Db, range: DateRange, filter: Filter) =>
  rawQuery<Movement>(db, sql`
    SELECT t.transaction_date AS day,
      COALESCE(SUM(CASE WHEN t.type = 'import' AND r.id IS NULL THEN i.quantity_delta END), 0) AS imported,
      COALESCE(SUM(CASE WHEN t.type = 'export' AND r.id IS NULL THEN -i.quantity_delta END), 0) AS exported,
      COALESCE(SUM(CASE WHEN t.type = 'adjust' AND r.id IS NULL THEN i.quantity_delta END), 0) AS adjusted,
      SUM(i.quantity_delta) AS net,
      SUM(i.quantity_delta * p.cost_price) AS netValue
    FROM ${LEDGER_FROM}
    LEFT JOIN inventory_transactions r ON r.reversal_of_id = t.id AND r.status = 'confirmed'
    WHERE ${ledgerFilter(filter)} AND t.transaction_date BETWEEN ${range.from} AND ${range.to}
    GROUP BY t.transaction_date`);

const openingQuery = (db: Db, from: string, filter: Filter) =>
  rawQuery<Totals>(db, sql`
    SELECT COALESCE(SUM(i.quantity_delta), 0) AS quantity,
      COALESCE(SUM(i.quantity_delta * p.cost_price), 0) AS value
    FROM ${LEDGER_FROM}
    WHERE ${ledgerFilter(filter)} AND t.transaction_date < ${from}`);

const isMonthly = ({ from, to }: DateRange) => daysBetween(from, to) >= MAX_DAILY_POINTS;

function periodsOf(range: DateRange): string[] {
  const days: string[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) days.push(day);
  return isMonthly(range) ? [...new Set(days.map((day) => day.slice(0, 7)))] : days;
}

const periodOf = (day: string, range: DateRange) => (isMonthly(range) ? day.slice(0, 7) : day);

export function buildStockSeries(range: DateRange, rows: Movement[], opening: Totals): StockPoint[] {
  const byPeriod = new Map<string, Omit<Movement, "day">>();
  for (const row of rows) {
    const period = periodOf(row.day, range);
    const entry = byPeriod.get(period) ?? { imported: 0, exported: 0, adjusted: 0, net: 0, netValue: 0 };
    entry.imported += row.imported;
    entry.exported += row.exported;
    entry.adjusted += row.adjusted;
    entry.net += row.net;
    entry.netValue += row.netValue;
    byPeriod.set(period, entry);
  }

  let stock = opening.quantity;
  let value = opening.value;
  return periodsOf(range).map((period) => {
    const entry = byPeriod.get(period);
    stock += entry?.net ?? 0;
    value += entry?.netValue ?? 0;
    return {
      period,
      imported: entry?.imported ?? 0,
      exported: entry?.exported ?? 0,
      adjusted: entry?.adjusted ?? 0,
      net: entry?.net ?? 0,
      stock,
      value,
    };
  });
}

type SalesDay = { day: string; documents: number; revenue: number; cost: number };

/**
 * Sales are confirmed exports that were not reversed. Exports to employees are internal
 * use, so they are not revenue. Exports without a recognised recipient predate the link
 * to customers and were recorded as sales.
 */
const salesQuery = (db: Db, range: DateRange) =>
  rawQuery<SalesDay>(db, sql`
    SELECT t.transaction_date AS day,
      COUNT(DISTINCT t.id) AS documents,
      SUM(-i.quantity_delta * COALESCE(i.unit_price, 0)) AS revenue,
      SUM(-i.quantity_delta * COALESCE(i.unit_cost, p.cost_price)) AS cost
    FROM ${LEDGER_FROM}
    WHERE t.status = 'confirmed' AND t.type = 'export' AND t.employee_id IS NULL
      AND t.transaction_date BETWEEN ${range.from} AND ${range.to}
      AND NOT EXISTS (
        SELECT 1 FROM inventory_transactions r
        WHERE r.reversal_of_id = t.id AND r.status = 'confirmed'
      )
    GROUP BY t.transaction_date`);

function buildSalesSeries(range: DateRange, rows: SalesDay[]): SalesPoint[] {
  const byPeriod = new Map<string, SalesPoint>();
  for (const row of rows) {
    const period = periodOf(row.day, range);
    const entry = byPeriod.get(period) ?? { period, revenue: 0, grossProfit: 0 };
    entry.revenue += row.revenue;
    entry.grossProfit += row.revenue - row.cost;
    byPeriod.set(period, entry);
  }
  return periodsOf(range).map(
    (period) => byPeriod.get(period) ?? { period, revenue: 0, grossProfit: 0 },
  );
}

function buildCountSeries(range: DateRange, rows: { day: string; count: number }[]): CountPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const period = periodOf(row.day, range);
    counts.set(period, (counts.get(period) ?? 0) + row.count);
  }
  return periodsOf(range).map((period) => ({ period, count: counts.get(period) ?? 0 }));
}

const categoryQuery = (db: Db, categoryId?: number) =>
  rawQuery<CategoryStock>(db, sql`
    SELECT c.id, c.name,
      COUNT(p.id) AS products,
      COALESCE(SUM(b.quantity), 0) AS quantity,
      COALESCE(SUM(b.quantity * p.cost_price), 0) AS value
    FROM product_categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
    LEFT JOIN inventory_balances b ON b.product_id = p.id
    ${categoryId ? sql`WHERE c.id = ${categoryId}` : sql``}
    GROUP BY c.id
    ORDER BY value DESC, c.name`);

const alertQuery = (db: Db, kind: "low" | "out", limit: number, categoryId?: number) =>
  rawQuery<StockAlertProduct>(db, sql`
    SELECT p.id, p.sku, p.name, p.unit, b.quantity, p.min_stock AS minStock
    FROM products p JOIN inventory_balances b ON b.product_id = p.id
    WHERE p.deleted_at IS NULL AND p.status = 'active'
      AND ${kind === "out" ? sql`b.quantity = 0` : sql`b.quantity > 0 AND b.quantity <= p.min_stock`}
      ${categoryId ? sql`AND p.category_id = ${categoryId}` : sql``}
    ORDER BY b.quantity, p.name
    LIMIT ${limit}`);

type StockTotals = {
  products: number;
  active: number;
  discontinued: number;
  stockQuantity: number;
  stockValue: number;
  lowStock: number;
  outOfStock: number;
};

const stockTotalsQuery = (db: Db, filter: Filter = {}) =>
  rawQuery<StockTotals>(db, sql`
    SELECT COUNT(*) AS products,
      COALESCE(SUM(p.status = 'active'), 0) AS active,
      COALESCE(SUM(p.status = 'discontinued'), 0) AS discontinued,
      COALESCE(SUM(b.quantity), 0) AS stockQuantity,
      COALESCE(SUM(b.quantity * p.cost_price), 0) AS stockValue,
      COALESCE(SUM(p.status = 'active' AND b.quantity > 0 AND b.quantity <= p.min_stock), 0) AS lowStock,
      COALESCE(SUM(p.status = 'active' AND b.quantity = 0), 0) AS outOfStock
    FROM products p JOIN inventory_balances b ON b.product_id = p.id
    WHERE p.deleted_at IS NULL
      ${filter.productId ? sql`AND p.id = ${filter.productId}` : sql``}
      ${filter.categoryId ? sql`AND p.category_id = ${filter.categoryId}` : sql``}`);

export async function getDashboardSummary(db: Db, range: DateRange): Promise<DashboardSummary> {
  const results = await readBatch(db, [
    rawQuery(db, sql`
      SELECT (SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL) AS employees,
        (SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL) AS customers`),
    stockTotalsQuery(db),
    // Documents cancelled by a confirmed reversal no longer count.
    rawQuery(db, sql`
      SELECT COALESCE(SUM(t.type = 'import'), 0) AS imports,
        COALESCE(SUM(t.type = 'export'), 0) AS exports
      FROM inventory_transactions t
      WHERE t.status = 'confirmed'
        AND t.transaction_date BETWEEN ${range.from} AND ${range.to}
        AND NOT EXISTS (
          SELECT 1 FROM inventory_transactions r
          WHERE r.reversal_of_id = t.id AND r.status = 'confirmed'
        )`),
    alertQuery(db, "low", ALERT_LIST_SIZE),
    alertQuery(db, "out", ALERT_LIST_SIZE),
    rawQuery(db, sql`
      SELECT id, code, name, type, created_at AS createdAt
      FROM customers WHERE deleted_at IS NULL
        AND created_at >= ${vnDayStartUtc(range.from)} AND created_at < ${vnDayEndUtc(range.to)}
      ORDER BY created_at DESC, id DESC LIMIT 6`),
    rawQuery(db, sql`
      SELECT t.id, t.code, t.type, t.transaction_date AS transactionDate,
        COALESCE(SUM(ABS(i.quantity_delta)), 0) AS totalQuantity
      FROM inventory_transactions t
      LEFT JOIN inventory_transaction_items i ON i.transaction_id = t.id
      WHERE t.status = 'confirmed'
      GROUP BY t.id
      ORDER BY t.transaction_date DESC, t.id DESC LIMIT 8`),
    salesQuery(db, range),
  ]);
  const [people, stock, documents, low, out, newCustomers, recent, sales] = results as [
    { employees: number; customers: number }[],
    StockTotals[],
    { imports: number; exports: number }[],
    StockAlertProduct[],
    StockAlertProduct[],
    DashboardSummary["newCustomers"],
    DashboardSummary["recentTransactions"],
    SalesDay[],
  ];
  const totals = stock[0]!;
  const sumSales = (key: "documents" | "revenue" | "cost") =>
    sales.reduce((total, row) => total + row[key], 0);
  return {
    employees: people[0]!.employees,
    customers: people[0]!.customers,
    products: totals.products,
    stockQuantity: totals.stockQuantity,
    stockValue: totals.stockValue,
    lowStock: totals.lowStock,
    outOfStock: totals.outOfStock,
    importTransactions: documents[0]!.imports,
    exportTransactions: documents[0]!.exports,
    revenue: sumSales("revenue"),
    grossProfit: sumSales("revenue") - sumSales("cost"),
    salesDocuments: sumSales("documents"),
    lowStockProducts: low,
    outOfStockProducts: out,
    newCustomers,
    recentTransactions: recent,
  };
}

export async function getDashboardCharts(db: Db, range: DateRange): Promise<DashboardCharts> {
  const [movements, opening, categories, sales] = (await readBatch(db, [
    movementQuery(db, range, {}),
    openingQuery(db, range.from, {}),
    categoryQuery(db),
    salesQuery(db, range),
  ])) as [Movement[], Totals[], CategoryStock[], SalesDay[]];
  return {
    series: buildStockSeries(range, movements, opening[0]!),
    categories,
    sales: buildSalesSeries(range, sales),
  };
}

export async function getEmployeeReport(db: Db, range: DateRange): Promise<EmployeeReport> {
  const [totals, hires] = (await readBatch(db, [
    rawQuery(db, sql`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(status = 'active'), 0) AS active,
        COALESCE(SUM(status = 'on_leave'), 0) AS onLeave,
        COALESCE(SUM(status = 'resigned'), 0) AS resigned
      FROM employees WHERE deleted_at IS NULL`),
    rawQuery(db, sql`
      SELECT hire_date AS day, COUNT(*) AS count FROM employees
      WHERE deleted_at IS NULL AND hire_date BETWEEN ${range.from} AND ${range.to}
      GROUP BY hire_date`),
  ])) as [Omit<EmployeeReport, "hires">[], { day: string; count: number }[]];
  return { ...totals[0]!, hires: buildCountSeries(range, hires) };
}

export async function getCustomerReport(db: Db, range: DateRange): Promise<CustomerReport> {
  const [totals, created] = (await readBatch(db, [
    rawQuery(db, sql`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(type = 'individual'), 0) AS individual,
        COALESCE(SUM(type = 'business'), 0) AS business
      FROM customers WHERE deleted_at IS NULL`),
    rawQuery(db, sql`
      SELECT date(created_at, '+7 hours') AS day, COUNT(*) AS count FROM customers
      WHERE deleted_at IS NULL
        AND created_at >= ${vnDayStartUtc(range.from)} AND created_at < ${vnDayEndUtc(range.to)}
      GROUP BY day`),
  ])) as [Omit<CustomerReport, "series" | "newInRange">[], { day: string; count: number }[]];
  return {
    ...totals[0]!,
    newInRange: created.reduce((sum, row) => sum + row.count, 0),
    series: buildCountSeries(range, created),
  };
}

export async function getProductReport(db: Db, query: ReportQuery): Promise<ProductReport> {
  const filter = { productId: query.productId, categoryId: query.categoryId };
  const [stock, categories, low, out] = (await readBatch(db, [
    stockTotalsQuery(db, filter),
    categoryQuery(db, query.categoryId),
    alertQuery(db, "low", REPORT_LIST_SIZE, query.categoryId),
    alertQuery(db, "out", REPORT_LIST_SIZE, query.categoryId),
  ])) as [StockTotals[], CategoryStock[], StockAlertProduct[], StockAlertProduct[]];
  const totals = stock[0]!;
  return {
    total: totals.products,
    active: totals.active,
    discontinued: totals.discontinued,
    lowStock: totals.lowStock,
    outOfStock: totals.outOfStock,
    categories,
    lowStockProducts: low,
    outOfStockProducts: out,
  };
}

const historyWhere = (query: ReportQuery) =>
  sql`${ledgerFilter(query)} AND t.transaction_date BETWEEN ${query.from} AND ${query.to}`;

export const inventoryHistoryQuery = (db: Db, query: ReportQuery, limit: number, offset: number) =>
  rawQuery<InventoryHistoryRow>(db, sql`
    SELECT i.id, t.code, t.type, t.transaction_date AS transactionDate,
      p.sku, p.name AS productName, c.name AS categoryName, p.unit,
      i.quantity_delta AS quantityDelta, i.unit_price AS unitPrice,
      COALESCE(
        (SELECT name FROM customers WHERE id = t.customer_id),
        (SELECT full_name FROM employees WHERE id = t.employee_id),
        t.reference
      ) AS reference
    FROM ${LEDGER_FROM}
    JOIN product_categories c ON c.id = p.category_id
    WHERE ${historyWhere(query)}
    ORDER BY t.transaction_date DESC, t.id DESC, i.id
    LIMIT ${limit} OFFSET ${offset}`);

export const inventoryHistoryCount = (db: Db, query: ReportQuery) =>
  rawQuery<{ total: number }>(db, sql`
    SELECT COUNT(*) AS total FROM ${LEDGER_FROM} WHERE ${historyWhere(query)}`);

export async function getInventoryReport(db: Db, query: ReportQuery): Promise<InventoryReport> {
  const filter = { productId: query.productId, categoryId: query.categoryId };
  const [movements, opening, stock, history, count] = (await readBatch(db, [
    movementQuery(db, query, filter),
    openingQuery(db, query.from, filter),
    stockTotalsQuery(db, filter),
    inventoryHistoryQuery(db, query, query.pageSize, (query.page - 1) * query.pageSize),
    inventoryHistoryCount(db, query),
  ])) as [Movement[], Totals[], StockTotals[], InventoryHistoryRow[], { total: number }[]];
  const sum = (key: "imported" | "exported" | "adjusted") =>
    movements.reduce((total, row) => total + row[key], 0);
  return {
    imported: sum("imported"),
    exported: sum("exported"),
    adjusted: sum("adjusted"),
    stockQuantity: stock[0]!.stockQuantity,
    stockValue: stock[0]!.stockValue,
    series: buildStockSeries(query, movements, opening[0]!),
    history: {
      items: history,
      total: count[0]!.total,
      page: query.page,
      pageSize: query.pageSize,
    },
  };
}
