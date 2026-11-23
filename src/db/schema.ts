import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Conventions
 * - Timestamps are UTC ISO-8601 text; business dates are `YYYY-MM-DD` text.
 * - Money is whole VND stored as INTEGER, never floating point.
 * - Inventory rules are enforced by the triggers in migrations/0001_inventory_rules.sql.
 */
const nowUtc = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

const timestamps = {
  createdAt: text("created_at").notNull().default(nowUtc),
  updatedAt: text("updated_at")
    .notNull()
    .default(nowUtc)
    .$onUpdateFn(() => new Date().toISOString()),
};

const softDelete = { deletedAt: text("deleted_at") };

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: integer("id").primaryKey(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: text("password_changed_at").notNull().default(nowUtc),
    ...timestamps,
  },
  // The product has exactly one administrator.
  (t) => [check("admin_users_single_row", sql`${t.id} = 1`)],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    /** SHA-256 of the cookie token; the token itself is never stored. */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [index("admin_sessions_expires_idx").on(t.expiresAt)],
);

/** Fixed-window counters for login throttling (Workers have no shared memory). */
export const authRateLimits = sqliteTable(
  "auth_rate_limits",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").notNull(),
    windowStartedAt: text("window_started_at").notNull(),
  },
  (t) => [index("auth_rate_limits_window_idx").on(t.windowStartedAt)],
);

export const employees = sqliteTable(
  "employees",
  {
    id: integer("id").primaryKey(),
    code: text("code").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    position: text("position"),
    hireDate: text("hire_date"),
    status: text("status", { enum: ["active", "on_leave", "resigned"] })
      .notNull()
      .default("active"),
    address: text("address"),
    /** Monthly base salary in whole VND; NULL when not entered. */
    baseSalary: integer("base_salary"),
    note: text("note"),
    /** Small resized image as a data URL; the MVP does not use R2. */
    avatar: text("avatar"),
    /** Lowercase text without diacritics, so search ignores case and Vietnamese accents. */
    searchText: text("search_text").notNull().default(""),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("employees_code_unique").on(t.code).where(sql`${t.deletedAt} IS NULL`),
    index("employees_status_idx").on(t.status, t.deletedAt),
    index("employees_name_idx").on(t.fullName),
    check("employees_status_check", sql`${t.status} IN ('active', 'on_leave', 'resigned')`),
    check("employees_base_salary_check", sql`${t.baseSalary} IS NULL OR ${t.baseSalary} >= 0`),
  ],
);

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: ["individual", "business"] }).notNull(),
    /** Priority for customer care: 'normal' or 'vip'. */
    tier: text("tier", { enum: ["normal", "vip"] }).notNull().default("normal"),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    taxCode: text("tax_code"),
    note: text("note"),
    /** Lowercase text without diacritics, so search ignores case and Vietnamese accents. */
    searchText: text("search_text").notNull().default(""),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("customers_code_unique").on(t.code).where(sql`${t.deletedAt} IS NULL`),
    index("customers_type_idx").on(t.type, t.deletedAt),
    index("customers_tier_idx").on(t.tier, t.deletedAt),
    index("customers_created_idx").on(t.createdAt),
    index("customers_name_idx").on(t.name),
    check("customers_type_check", sql`${t.type} IN ('individual', 'business')`),
    check("customers_tier_check", sql`${t.tier} IN ('normal', 'vip')`),
  ],
);

export const customerNotes = sqliteTable(
  "customer_notes",
  {
    id: integer("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    ...timestamps,
  },
  (t) => [index("customer_notes_customer_idx").on(t.customerId, t.createdAt)],
);

export const productCategories = sqliteTable("product_categories", {
  id: integer("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  description: text("description"),
  ...timestamps,
});

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => productCategories.id, { onDelete: "restrict" }),
    unit: text("unit").notNull(),
    costPrice: integer("cost_price").notNull().default(0),
    salePrice: integer("sale_price").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    brand: text("brand"),
    specifications: text("specifications"),
    warrantyMonths: integer("warranty_months").notNull().default(0),
    description: text("description"),
    status: text("status", { enum: ["active", "discontinued"] })
      .notNull()
      .default("active"),
    image: text("image"),
    /** Lowercase text without diacritics, so search ignores case and Vietnamese accents. */
    searchText: text("search_text").notNull().default(""),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("products_sku_unique").on(t.sku).where(sql`${t.deletedAt} IS NULL`),
    index("products_category_idx").on(t.categoryId, t.deletedAt),
    index("products_status_idx").on(t.status, t.deletedAt),
    index("products_name_idx").on(t.name),
    check("products_cost_price_check", sql`${t.costPrice} >= 0`),
    check("products_sale_price_check", sql`${t.salePrice} >= 0`),
    check("products_min_stock_check", sql`${t.minStock} >= 0`),
    check("products_status_check", sql`${t.status} IN ('active', 'discontinued')`),
  ],
);

export const inventoryTransactions = sqliteTable(
  "inventory_transactions",
  {
    id: integer("id").primaryKey(),
    code: text("code").notNull().unique(),
    type: text("type", { enum: ["import", "export", "adjust", "reversal"] }).notNull(),
    status: text("status", { enum: ["draft", "confirmed", "cancelled"] })
      .notNull()
      .default("draft"),
    transactionDate: text("transaction_date").notNull(),
    /** External reference of the document, such as an order number. */
    reference: text("reference"),
    /** Recipient of an export: one customer or one employee. */
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    employeeId: integer("employee_id").references(() => employees.id, { onDelete: "restrict" }),
    reason: text("reason"),
    note: text("note"),
    reversalOfId: integer("reversal_of_id")
      .unique()
      .references((): AnySQLiteColumn => inventoryTransactions.id, { onDelete: "restrict" }),
    confirmedAt: text("confirmed_at"),
    ...timestamps,
  },
  (t) => [
    index("inventory_tx_list_idx").on(t.status, t.transactionDate),
    index("inventory_tx_type_idx").on(t.type, t.transactionDate),
    index("inventory_tx_customer_idx").on(t.customerId),
    index("inventory_tx_employee_idx").on(t.employeeId),
    check("inventory_tx_type_check", sql`${t.type} IN ('import', 'export', 'adjust', 'reversal')`),
    check("inventory_tx_status_check", sql`${t.status} IN ('draft', 'confirmed', 'cancelled')`),
    check(
      "inventory_tx_reversal_check",
      sql`(${t.type} = 'reversal') = (${t.reversalOfId} IS NOT NULL)`,
    ),
    check("inventory_tx_reason_check", sql`${t.type} <> 'adjust' OR ${t.reason} IS NOT NULL`),
  ],
);

export const inventoryTransactionItems = sqliteTable(
  "inventory_transaction_items",
  {
    id: integer("id").primaryKey(),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => inventoryTransactions.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** Signed stock movement: positive adds stock, negative removes it. */
    quantityDelta: integer("quantity_delta").notNull(),
    unitPrice: integer("unit_price"),
    /** Cost price when an export was confirmed, so later cost changes keep past profit intact. */
    unitCost: integer("unit_cost"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("inventory_items_tx_product_unique").on(t.transactionId, t.productId),
    index("inventory_items_product_idx").on(t.productId),
    check("inventory_items_delta_check", sql`${t.quantityDelta} <> 0`),
    check("inventory_items_price_check", sql`${t.unitPrice} IS NULL OR ${t.unitPrice} >= 0`),
  ],
);

/** Current stock per product. Rows are maintained only by database triggers. */
export const inventoryBalances = sqliteTable(
  "inventory_balances",
  {
    productId: integer("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(nowUtc),
  },
  (t) => [
    index("inventory_balances_quantity_idx").on(t.quantity),
    check("inventory_balances_non_negative", sql`${t.quantity} >= 0`),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey(),
    actorId: integer("actor_id").references(() => adminUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** JSON text. Never put passwords, tokens or other secrets here. */
    metadata: text("metadata"),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const companySettings = sqliteTable(
  "company_settings",
  {
    id: integer("id").primaryKey(),
    companyName: text("company_name").notNull(),
    logo: text("logo"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    taxCode: text("tax_code"),
    appName: text("app_name").notNull().default("Mini Business Manager"),
    dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
    currency: text("currency").notNull().default("VND"),
    timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
    ...timestamps,
  },
  (t) => [check("company_settings_single_row", sql`${t.id} = 1`)],
);
