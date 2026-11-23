import { aliasedTable, and, count, eq, exists, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { formatDate, vnToday } from "@shared/format";
import { TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS, type TransactionType } from "@shared/labels";
import type { InventoryLine, InventoryTransaction, InventoryTransactionDetail } from "@shared/types";
import type {
  AdjustInput,
  ExportDocumentInput,
  PricedDocumentInput,
  TransactionListQuery,
} from "@shared/validation/inventory";
import type { Db } from "../../db/client";
import {
  customers,
  employees,
  inventoryBalances,
  inventoryTransactionItems as items,
  inventoryTransactions as transactions,
  products,
} from "../../db/schema";
import type { ExportColumn } from "../lib/export";
import { auditQuery, dbErrorText, matchSearch, notFound, pageOffset, runBatch, toPage } from "../lib/db";
import { ApiError } from "../lib/errors";

type DocumentType = "import" | "export" | "adjust";
type Line = { productId: number; quantityDelta: number; unitPrice: number | null };
type Recipient = { customerId: number | null; employeeId: number | null };
type DocumentFields = Recipient & {
  transactionDate: string;
  reference: string | null;
  note: string | null;
  reason: string | null;
};
type DocumentInput = DocumentFields & { lines: Line[]; confirm: boolean };
type ProductFacts = {
  id: number;
  name: string;
  status: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
};

const CODE_PREFIX: Record<TransactionType, string> = {
  import: "PN",
  export: "PX",
  adjust: "DC",
  reversal: "DN",
};

/** Lines are inserted in chunks to stay under D1's 100 bound parameters per statement. */
const LINES_PER_STATEMENT = 20;

// Valid only inside a batch, which D1 runs as a single uninterrupted transaction.
const NEWEST_ID = sql<number>`(SELECT MAX(id) FROM inventory_transactions)`;

const summaryColumns = {
  id: transactions.id,
  code: transactions.code,
  type: transactions.type,
  status: transactions.status,
  transactionDate: transactions.transactionDate,
  reference: transactions.reference,
  customerId: transactions.customerId,
  employeeId: transactions.employeeId,
  // Deleted people stay visible here, so old documents keep their recipient.
  recipientCode: sql<string | null>`COALESCE(${customers.code}, ${employees.code})`.as("recipient_code"),
  recipientName: sql<string | null>`COALESCE(${customers.name}, ${employees.fullName})`.as("recipient_name"),
  reason: transactions.reason,
  note: transactions.note,
  reversalOfId: transactions.reversalOfId,
  confirmedAt: transactions.confirmedAt,
  createdAt: transactions.createdAt,
  lineCount: sql<number>`COUNT(${items.id})`,
  totalQuantity: sql<number>`COALESCE(SUM(ABS(${items.quantityDelta})), 0)`,
  totalAmount: sql<number>`COALESCE(SUM(ABS(${items.quantityDelta}) * ${items.unitPrice}), 0)`,
};

const insufficientStock = (detail?: string) =>
  new ApiError(409, "INSUFFICIENT_STOCK", detail ?? "Không đủ tồn kho để thực hiện giao dịch");

function translateLedgerError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  const text = dbErrorText(error);
  if (text.includes("CHECK constraint failed")) throw insufficientStock();
  if (text.includes("INVENTORY_TRANSACTION_LOCKED")) throw notDraft();
  if (text.includes("INVENTORY_PRODUCT_DELETED")) {
    throw new ApiError(409, "PRODUCT_UNAVAILABLE", "Phiếu có sản phẩm đã bị xóa");
  }
  if (text.includes("inventory_transactions.reversal_of_id")) throw alreadyReversed();
  if (text.includes("INVENTORY_INVALID_REVERSAL")) {
    throw new ApiError(409, "INVALID_REVERSAL", "Phiếu này không thể đảo ngược");
  }
  if (text.includes("INVENTORY_INVALID_RECIPIENT")) {
    throw recipientError("customerId", "Người nhận không hợp lệ");
  }
  throw error;
}

const recipientError = (field: "customerId" | "employeeId", message: string) =>
  new ApiError(422, "VALIDATION_ERROR", message, { [field]: message });

async function assertRecipientExists(db: Db, { customerId, employeeId }: Recipient) {
  if (customerId) {
    const [row] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
      .limit(1);
    if (!row) throw recipientError("customerId", "Khách hàng không tồn tại hoặc đã bị xóa");
  }
  if (employeeId) {
    const [row] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), isNull(employees.deletedAt)))
      .limit(1);
    if (!row) throw recipientError("employeeId", "Nhân viên không tồn tại hoặc đã bị xóa");
  }
}

const notDraft = () =>
  new ApiError(409, "TRANSACTION_LOCKED", "Chỉ có thể thay đổi phiếu đang ở trạng thái nháp");
const alreadyReversed = () =>
  new ApiError(409, "ALREADY_REVERSED", "Phiếu này đã được đảo ngược");

async function loadProducts(db: Db, productIds: number[]): Promise<Map<number, ProductFacts>> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      status: products.status,
      costPrice: products.costPrice,
      salePrice: products.salePrice,
      quantity: inventoryBalances.quantity,
    })
    .from(products)
    .innerJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(and(inArray(products.id, productIds), sql`${products.deletedAt} IS NULL`));
  return new Map(rows.map((row) => [row.id, row]));
}

function lineError(index: number, message: string) {
  return new ApiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", {
    [`lines.${index}.productId`]: message,
  });
}

/** Gives a precise message. The database CHECK remains the guarantee against races. */
function assertStockAvailable(lines: Line[], facts: Map<number, ProductFacts>) {
  for (const line of lines) {
    const product = facts.get(line.productId);
    if (product && product.quantity + line.quantityDelta < 0) {
      throw insufficientStock(
        `Không đủ tồn kho cho "${product.name}": còn ${product.quantity}, cần ${-line.quantityDelta}`,
      );
    }
  }
}

/** Validates the products, fills default prices and, when confirming, checks stock. */
async function prepareLines(db: Db, type: DocumentType, input: DocumentInput): Promise<Line[]> {
  const facts = await loadProducts(db, input.lines.map((line) => line.productId));
  const lines = input.lines.map((line, index) => {
    const product = facts.get(line.productId);
    if (!product) throw lineError(index, "Sản phẩm không tồn tại");
    if (type === "import" && product.status !== "active") {
      throw lineError(index, "Sản phẩm đã ngừng kinh doanh");
    }
    const defaultPrice = { import: product.costPrice, export: product.salePrice, adjust: null }[type];
    return { ...line, unitPrice: line.unitPrice ?? defaultPrice };
  });
  if (input.confirm) assertStockAvailable(lines, facts);
  return lines;
}

function lineInserts(db: Db, transactionId: number | typeof NEWEST_ID, lines: Line[]) {
  const statements = [];
  for (let start = 0; start < lines.length; start += LINES_PER_STATEMENT) {
    statements.push(
      db.insert(items).values(
        lines.slice(start, start + LINES_PER_STATEMENT).map((line) => ({ ...line, transactionId })),
      ),
    );
  }
  return statements;
}

const confirmQuery = (db: Db, where: ReturnType<typeof eq>) =>
  db
    .update(transactions)
    .set({ status: "confirmed", confirmedAt: new Date().toISOString() })
    .where(and(where, eq(transactions.status, "draft")))
    .returning({ id: transactions.id });

/** Runs while the document is still a draft, because confirmed lines are locked. */
const snapshotCosts = (db: Db, transactionId: number | typeof NEWEST_ID) =>
  db
    .update(items)
    .set({
      unitCost: sql`(SELECT ${products.costPrice} FROM ${products} WHERE ${products.id} = ${items.productId})`,
    })
    .where(eq(items.transactionId, transactionId));

const confirmSteps = (db: Db, type: TransactionType, id: number | typeof NEWEST_ID) => [
  ...(type === "export" ? [snapshotCosts(db, id)] : []),
  confirmQuery(db, eq(transactions.id, id)),
];

const documentFields = (input: DocumentFields) => ({
  transactionDate: input.transactionDate,
  reference: input.reference,
  customerId: input.customerId,
  employeeId: input.employeeId,
  note: input.note,
  reason: input.reason,
});

const NO_RECIPIENT: Recipient = { customerId: null, employeeId: null };

const pricedLines = (input: PricedDocumentInput, sign: 1 | -1): Line[] =>
  input.lines.map((line) => ({
    productId: line.productId,
    quantityDelta: sign * line.quantity,
    unitPrice: line.unitPrice,
  }));

export const toDocument = {
  import: (input: PricedDocumentInput): DocumentInput => ({
    ...input,
    ...NO_RECIPIENT,
    reason: null,
    lines: pricedLines(input, 1),
  }),
  export: (input: ExportDocumentInput): DocumentInput => ({
    ...input,
    reason: null,
    lines: pricedLines(input, -1),
  }),
  adjust: (input: AdjustInput): DocumentInput => ({
    ...input,
    ...NO_RECIPIENT,
    lines: input.lines.map((line) => ({
      productId: line.productId,
      quantityDelta: line.delta,
      unitPrice: null,
    })),
  }),
};

const nextDocumentCode = (type: TransactionType) =>
  sql<string>`${CODE_PREFIX[type]} || '-' || printf('%06d', COALESCE((SELECT MAX(id) FROM inventory_transactions), 0) + 1)`;

export async function createDocument(db: Db, actorId: number, type: DocumentType, input: DocumentInput) {
  await assertRecipientExists(db, input);
  const lines = await prepareLines(db, type, input);
  let results: unknown[] = [];
  try {
    results = await runBatch(db, [
      db
        .insert(transactions)
        .values({ ...documentFields(input), code: nextDocumentCode(type), type })
        .returning({ id: transactions.id }),
      ...lineInserts(db, NEWEST_ID, lines),
      ...(input.confirm ? confirmSteps(db, type, NEWEST_ID) : []),
      auditQuery(db, actorId, `inventory.${type}`, "inventory_transaction", sql<string>`CAST(${NEWEST_ID} AS TEXT)`, {
        confirmed: input.confirm,
      }),
    ]);
  } catch (error) {
    translateLedgerError(error);
  }
  return getTransaction(db, (results[0] as { id: number }[])[0]!.id);
}

async function findDraftHeader(db: Db, id: number) {
  const [row] = await db
    .select({
      type: transactions.type,
      status: transactions.status,
      customerId: transactions.customerId,
      employeeId: transactions.employeeId,
    })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (!row) throw notFound("Không tìm thấy phiếu kho");
  if (row.status !== "draft") throw notDraft();
  return row;
}

export async function updateDraft(
  db: Db,
  actorId: number,
  id: number,
  type: DocumentType,
  input: DocumentInput,
) {
  const header = await findDraftHeader(db, id);
  if (header.type !== type) throw notFound("Không tìm thấy phiếu kho");
  await assertRecipientExists(db, input);
  const lines = await prepareLines(db, type, input);

  try {
    await runBatch(db, [
      db
        .update(transactions)
        .set(documentFields(input))
        .where(and(eq(transactions.id, id), eq(transactions.status, "draft"))),
      db.delete(items).where(eq(items.transactionId, id)),
      ...lineInserts(db, id, lines),
      ...(input.confirm ? confirmSteps(db, type, id) : []),
      auditQuery(db, actorId, "inventory.draft_update", "inventory_transaction", String(id), {
        confirmed: input.confirm,
      }),
    ]);
  } catch (error) {
    translateLedgerError(error);
  }
  return getTransaction(db, id);
}

export async function confirmTransaction(db: Db, actorId: number, id: number) {
  const header = await findDraftHeader(db, id);
  if (header.type === "export" && !header.customerId && !header.employeeId) {
    throw recipientError("customerId", "Phiếu xuất kho cần có người nhận trước khi xác nhận");
  }
  await assertRecipientExists(db, header);
  const lines = await db
    .select({ productId: items.productId, quantityDelta: items.quantityDelta, unitPrice: items.unitPrice })
    .from(items)
    .where(eq(items.transactionId, id));
  if (lines.length === 0) {
    throw new ApiError(409, "EMPTY_TRANSACTION", "Phiếu chưa có sản phẩm nào");
  }
  assertStockAvailable(lines, await loadProducts(db, lines.map((line) => line.productId)));

  const steps = confirmSteps(db, header.type, id);
  let results: unknown[] = [];
  try {
    results = await runBatch(db, [
      ...steps,
      auditQuery(db, actorId, "inventory.confirm", "inventory_transaction", String(id)),
    ]);
  } catch (error) {
    translateLedgerError(error);
  }
  // A concurrent request may have confirmed it between the read and this write.
  if ((results[steps.length - 1] as unknown[]).length === 0) throw notDraft();
  return getTransaction(db, id);
}

export async function cancelTransaction(db: Db, actorId: number, id: number) {
  await findDraftHeader(db, id);
  await runBatch(db, [
    db
      .update(transactions)
      .set({ status: "cancelled" })
      .where(and(eq(transactions.id, id), eq(transactions.status, "draft"))),
    auditQuery(db, actorId, "inventory.cancel", "inventory_transaction", String(id)),
  ]);
  return getTransaction(db, id);
}

export async function reverseTransaction(db: Db, actorId: number, id: number, reason: string) {
  const original = await getTransaction(db, id);
  if (original.status !== "confirmed") {
    throw new ApiError(409, "INVALID_REVERSAL", "Chỉ có thể đảo ngược phiếu đã xác nhận");
  }
  if (original.type === "reversal") {
    throw new ApiError(409, "INVALID_REVERSAL", "Không thể đảo ngược một phiếu đảo ngược");
  }
  if (original.reversedBy) throw alreadyReversed();

  const lines: Line[] = original.lines.map((line) => ({
    productId: line.productId,
    quantityDelta: -line.quantityDelta,
    unitPrice: line.unitPrice,
  }));
  assertStockAvailable(lines, await loadProducts(db, lines.map((line) => line.productId)));

  try {
    await runBatch(db, [
      db.insert(transactions).values({
        code: nextDocumentCode("reversal"),
        type: "reversal",
        reversalOfId: id,
        transactionDate: vnToday(),
        reason,
        reference: original.code,
      }),
      ...lineInserts(db, NEWEST_ID, lines),
      confirmQuery(db, eq(transactions.id, NEWEST_ID)),
      auditQuery(db, actorId, "inventory.reverse", "inventory_transaction", String(id)),
    ]);
  } catch (error) {
    translateLedgerError(error);
  }
  return getTransaction(db, id);
}

function searchDocuments(term: string) {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return sql`(${transactions.code} LIKE ${pattern} ESCAPE '\\'
    OR ${transactions.reference} LIKE ${pattern} ESCAPE '\\'
    OR ${matchSearch(customers.searchText, term)}
    OR ${matchSearch(employees.searchText, term)})`;
}

export async function listTransactions(db: Db, query: TransactionListQuery) {
  const where = and(
    query.type ? eq(transactions.type, query.type) : undefined,
    query.status ? eq(transactions.status, query.status) : undefined,
    query.from ? gte(transactions.transactionDate, query.from) : undefined,
    query.to ? lte(transactions.transactionDate, query.to) : undefined,
    query.customerId ? eq(transactions.customerId, query.customerId) : undefined,
    query.employeeId ? eq(transactions.employeeId, query.employeeId) : undefined,
    query.search ? searchDocuments(query.search) : undefined,
    query.productId
      ? exists(
          db
            .select({ id: items.id })
            .from(items)
            .where(and(eq(items.transactionId, transactions.id), eq(items.productId, query.productId))),
        )
      : undefined,
  );
  const order = query.dir === "asc" ? sql`ASC` : sql`DESC`;
  const [totals, rows] = await db.batch([
    db
      .select({ total: count() })
      .from(transactions)
      .leftJoin(customers, eq(customers.id, transactions.customerId))
      .leftJoin(employees, eq(employees.id, transactions.employeeId))
      .where(where),
    db
      .select(summaryColumns)
      .from(transactions)
      .leftJoin(items, eq(items.transactionId, transactions.id))
      .leftJoin(customers, eq(customers.id, transactions.customerId))
      .leftJoin(employees, eq(employees.id, transactions.employeeId))
      .where(where)
      .groupBy(transactions.id)
      .orderBy(sql`${transactions.transactionDate} ${order}`, sql`${transactions.id} ${order}`)
      .limit(query.pageSize)
      .offset(pageOffset(query)),
  ]);
  return toPage<InventoryTransaction>(rows, totals[0]?.total ?? 0, query);
}

export async function getTransaction(db: Db, id: number): Promise<InventoryTransactionDetail> {
  const original = aliasedTable(transactions, "original");
  const reversal = aliasedTable(transactions, "reversal");
  const [headers, lines, links] = await db.batch([
    db
      .select(summaryColumns)
      .from(transactions)
      .leftJoin(items, eq(items.transactionId, transactions.id))
      .leftJoin(customers, eq(customers.id, transactions.customerId))
      .leftJoin(employees, eq(employees.id, transactions.employeeId))
      .where(eq(transactions.id, id))
      .groupBy(transactions.id),
    db
      .select({
        id: items.id,
        productId: items.productId,
        sku: products.sku,
        productName: products.name,
        unit: products.unit,
        quantityDelta: items.quantityDelta,
        unitPrice: items.unitPrice,
      })
      .from(items)
      .innerJoin(products, eq(products.id, items.productId))
      .where(eq(items.transactionId, id))
      .orderBy(items.id),
    db
      .select({
        // Aliased because D1 batches merge result columns that share a name.
        reversalOfCode: sql<string | null>`${original.code}`.as("reversal_of_code"),
        reversedById: sql<number | null>`${reversal.id}`.as("reversed_by_id"),
        reversedByCode: sql<string | null>`${reversal.code}`.as("reversed_by_code"),
      })
      .from(transactions)
      .leftJoin(original, eq(original.id, transactions.reversalOfId))
      .leftJoin(reversal, eq(reversal.reversalOfId, transactions.id))
      .where(eq(transactions.id, id)),
  ]);
  const header = headers[0];
  if (!header?.id) throw notFound("Không tìm thấy phiếu kho");
  const link = links[0] as
    | { reversalOfCode: string | null; reversedById: number | null; reversedByCode: string | null }
    | undefined;
  return {
    ...header,
    lines: lines.map(
      (line): InventoryLine => ({
        ...line,
        amount: line.unitPrice === null ? null : Math.abs(line.quantityDelta) * line.unitPrice,
      }),
    ),
    reversalOfCode: link?.reversalOfCode ?? null,
    reversedBy:
      link?.reversedById && link.reversedByCode
        ? { id: link.reversedById, code: link.reversedByCode }
        : null,
  };
}

export const TRANSACTION_EXPORT: ExportColumn<InventoryTransaction>[] = [
  { header: "Mã phiếu", value: (row) => row.code },
  { header: "Loại phiếu", value: (row) => TRANSACTION_TYPE_LABELS[row.type] },
  { header: "Trạng thái", value: (row) => TRANSACTION_STATUS_LABELS[row.status] },
  { header: "Ngày", value: (row) => formatDate(row.transactionDate) },
  { header: "Số dòng", value: (row) => row.lineCount },
  { header: "Tổng số lượng", value: (row) => row.totalQuantity },
  { header: "Thành tiền (VND)", value: (row) => row.totalAmount },
  { header: "Mã người nhận", value: (row) => row.recipientCode },
  { header: "Người nhận", value: (row) => row.recipientName },
  { header: "Tham chiếu", value: (row) => row.reference },
  { header: "Lý do", value: (row) => row.reason },
  { header: "Ghi chú", value: (row) => row.note },
];
