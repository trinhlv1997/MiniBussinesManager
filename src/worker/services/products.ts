import { and, asc, count, desc, eq, getTableColumns, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { PRODUCT_STATUS_LABELS, STOCK_STATUS_LABELS, stockStatusOf, warrantyLabel } from "@shared/labels";
import { priceForTier } from "@shared/pricing";
import { toSearchText } from "@shared/text";
import type { Product, ProductCategory, ProductDetail } from "@shared/types";
import type { CategoryInput, ProductInput, ProductListQuery } from "@shared/validation/entities";
import type { Db } from "../../db/client";
import type { Actor } from "../env";
import {
  inventoryBalances,
  inventoryTransactionItems,
  productCategories,
  products,
} from "../../db/schema";
import type { ExportColumn } from "../lib/export";
import {
  LAST_INSERT_ID,
  auditQuery,
  dbErrorText,
  duplicate,
  matchSearch,
  nextCode,
  notFound,
  omit,
  pageOffset,
  runBatch,
  toPage,
} from "../lib/db";
import { ApiError } from "../lib/errors";

const listColumns = {
  ...omit(getTableColumns(products), ["searchText", "deletedAt", "image"]),
  // Aliased because D1 batches merge result columns that share a name.
  categoryName: sql<string>`${productCategories.name}`.as("category_name"),
  quantity: inventoryBalances.quantity,
};
const live = (id: number) => and(eq(products.id, id), isNull(products.deletedAt));

const SORT_COLUMNS = {
  sku: products.sku,
  name: products.name,
  quantity: inventoryBalances.quantity,
  costPrice: products.costPrice,
  salePrice: products.salePrice,
  createdAt: products.createdAt,
};

const STOCK_FILTERS = {
  out_of_stock: lte(inventoryBalances.quantity, 0),
  low_stock: and(
    gt(inventoryBalances.quantity, 0),
    lte(inventoryBalances.quantity, products.minStock),
  ),
  in_stock: and(
    gt(inventoryBalances.quantity, 0),
    gt(inventoryBalances.quantity, products.minStock),
  ),
};

const withStock = <T extends { quantity: number; minStock: number }>(row: T) => ({
  ...row,
  stockStatus: stockStatusOf(row.quantity, row.minStock),
});

const searchTextOf = (input: ProductInput, sku: string) =>
  toSearchText(sku, input.name, input.brand, input.specifications);

function rethrow(error: unknown): never {
  const text = dbErrorText(error);
  if (text.includes("UNIQUE constraint failed")) throw duplicate("sku", "Mã SKU đã tồn tại");
  if (text.includes("FOREIGN KEY constraint failed")) {
    throw new ApiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", {
      categoryId: "Danh mục không tồn tại",
    });
  }
  throw error;
}

export async function listProducts(db: Db, query: ProductListQuery) {
  const where = and(
    isNull(products.deletedAt),
    query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
    query.status ? eq(products.status, query.status) : undefined,
    query.stockStatus ? STOCK_FILTERS[query.stockStatus] : undefined,
    query.search ? matchSearch(products.searchText, query.search) : undefined,
  );
  const direction = query.dir === "asc" ? asc : desc;
  const [totals, rows] = await db.batch([
    db
      .select({ total: count() })
      .from(products)
      .innerJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
      .where(where),
    db
      .select(listColumns)
      .from(products)
      .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
      .innerJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
      .where(where)
      .orderBy(direction(SORT_COLUMNS[query.sort]), desc(products.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
  ]);
  return toPage<Product>(rows.map(withStock), totals[0]?.total ?? 0, query);
}

export async function getProduct(db: Db, id: number): Promise<ProductDetail> {
  const [row] = await db
    .select({
      ...listColumns,
      image: products.image,
      hasHistory: sql<number>`EXISTS (
        SELECT 1 FROM ${inventoryTransactionItems}
        WHERE ${inventoryTransactionItems.productId} = ${products.id}
      )`,
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .innerJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(live(id))
    .limit(1);
  if (!row) throw notFound("Không tìm thấy sản phẩm");
  return { ...withStock(row), hasHistory: Boolean(row.hasHistory) };
}

export async function createProduct(db: Db, actor: Actor, input: ProductInput) {
  const sku = input.sku ?? (await nextCode(db, "products", "SP"));
  try {
    const [rows] = (await runBatch(db, [
      db
        .insert(products)
        .values({ ...input, sku, searchText: searchTextOf(input, sku), createdBy: actor.id, updatedBy: actor.id })
        .returning({ id: products.id }),
      auditQuery(db, actor.id, "product.create", "product", LAST_INSERT_ID, { sku }),
    ])) as [{ id: number }[]];
    return getProduct(db, rows[0]!.id);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    rethrow(error);
  }
}

export async function updateProduct(db: Db, actor: Actor, id: number, input: ProductInput) {
  const existing = await getProduct(db, id);
  const sku = input.sku ?? existing.sku;
  try {
    await runBatch(db, [
      db
        .update(products)
        .set({ ...input, sku, searchText: searchTextOf(input, sku), updatedBy: actor.id })
        .where(live(id)),
      auditQuery(db, actor.id, "product.update", "product", String(id), { sku }),
    ]);
  } catch (error) {
    rethrow(error);
  }
  return getProduct(db, id);
}

export async function deleteProduct(db: Db, actor: Actor, id: number) {
  const existing = await getProduct(db, id);
  try {
    await runBatch(db, [
      db.update(products).set({ deletedAt: new Date().toISOString(), updatedBy: actor.id }).where(live(id)),
      auditQuery(db, actor.id, "product.delete", "product", String(id), { sku: existing.sku }),
    ]);
  } catch (error) {
    if (dbErrorText(error).includes("PRODUCT_HAS_INVENTORY_HISTORY")) {
      throw new ApiError(
        409,
        "PRODUCT_HAS_HISTORY",
        "Sản phẩm đã có giao dịch kho nên không thể xóa. Hãy chuyển sang trạng thái ngừng kinh doanh.",
      );
    }
    throw error;
  }
}

const categoryColumns = {
  id: productCategories.id,
  code: productCategories.code,
  name: productCategories.name,
  description: productCategories.description,
  productCount: sql<number>`(
    SELECT COUNT(*) FROM ${products}
    WHERE ${products.categoryId} = ${productCategories.id} AND ${products.deletedAt} IS NULL
  )`,
};

export function listCategories(db: Db): Promise<ProductCategory[]> {
  return db.select(categoryColumns).from(productCategories).orderBy(asc(productCategories.name)).limit(200);
}

async function getCategory(db: Db, id: number): Promise<ProductCategory> {
  const [row] = await db
    .select(categoryColumns)
    .from(productCategories)
    .where(eq(productCategories.id, id))
    .limit(1);
  if (!row) throw notFound("Không tìm thấy danh mục");
  return row;
}

function rethrowCategory(error: unknown): never {
  const text = dbErrorText(error);
  if (text.includes("product_categories.code")) throw duplicate("code", "Mã danh mục đã tồn tại");
  if (text.includes("product_categories.name")) throw duplicate("name", "Tên danh mục đã tồn tại");
  throw error;
}

export async function createCategory(db: Db, actor: Actor, input: CategoryInput) {
  const code = input.code ?? (await nextCode(db, "product_categories", "DM"));
  try {
    const [rows] = (await runBatch(db, [
      db.insert(productCategories).values({ ...input, code, createdBy: actor.id, updatedBy: actor.id }).returning({ id: productCategories.id }),
      auditQuery(db, actor.id, "category.create", "product_category", LAST_INSERT_ID, { code }),
    ])) as [{ id: number }[]];
    return getCategory(db, rows[0]!.id);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    rethrowCategory(error);
  }
}

export async function updateCategory(db: Db, actor: Actor, id: number, input: CategoryInput) {
  const existing = await getCategory(db, id);
  const code = input.code ?? existing.code;
  try {
    await runBatch(db, [
      db.update(productCategories).set({ ...input, code, updatedBy: actor.id }).where(eq(productCategories.id, id)),
      auditQuery(db, actor.id, "category.update", "product_category", String(id), { code }),
    ]);
  } catch (error) {
    rethrowCategory(error);
  }
  return getCategory(db, id);
}

export async function deleteCategory(db: Db, actor: Actor, id: number) {
  const existing = await getCategory(db, id);
  if (existing.productCount > 0) {
    throw new ApiError(409, "CATEGORY_IN_USE", "Danh mục vẫn còn sản phẩm nên không thể xóa");
  }
  await runBatch(db, [
    // Soft-deleted products have no stock history, so they can be removed for good.
    db.delete(products).where(and(eq(products.categoryId, id), isNotNull(products.deletedAt))),
    db.delete(productCategories).where(eq(productCategories.id, id)),
    auditQuery(db, actor.id, "category.delete", "product_category", String(id), {
      code: existing.code,
    }),
  ]);
}

export const PRODUCT_EXPORT: ExportColumn<Product>[] = [
  { header: "Mã SKU", value: (row) => row.sku },
  { header: "Tên sản phẩm", value: (row) => row.name },
  { header: "Danh mục", value: (row) => row.categoryName },
  { header: "Thương hiệu", value: (row) => row.brand },
  { header: "Thông số kỹ thuật", value: (row) => row.specifications },
  { header: "Bảo hành", value: (row) => warrantyLabel(row.warrantyMonths) },
  { header: "Đơn vị tính", value: (row) => row.unit },
  { header: "Giá nhập (VND)", value: (row) => row.costPrice },
  // Giá thực áp dụng (để trống = bằng giá lẻ), để bảng tính luôn có số.
  { header: "Giá phân phối (VND)", value: (row) => priceForTier(row, "vip") },
  { header: "Giá đại lý (VND)", value: (row) => priceForTier(row, "normal") },
  { header: "Giá khách lẻ (VND)", value: (row) => row.salePrice },
  { header: "Số lượng tồn", value: (row) => row.quantity },
  { header: "Tồn tối thiểu", value: (row) => row.minStock },
  { header: "Tình trạng tồn kho", value: (row) => STOCK_STATUS_LABELS[row.stockStatus] },
  { header: "Trạng thái", value: (row) => PRODUCT_STATUS_LABELS[row.status] },
  { header: "Mô tả", value: (row) => row.description },
];
