import { z } from "zod";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../labels";
import {
  MAX_QUANTITY,
  idParam,
  money,
  optionalText,
  pageQuery,
  pastOrTodayDate,
  queryDate,
  queryEnum,
  queryId,
  requiredText,
} from "./common";

export const MAX_DOCUMENT_LINES = 50;

const productId = idParam;

const quantity = z
  .number("Vui lòng nhập số lượng")
  .int("Số lượng phải là số nguyên")
  .min(1, "Số lượng phải lớn hơn 0")
  .max(MAX_QUANTITY, "Số lượng quá lớn");

const documentBase = {
  transactionDate: pastOrTodayDate,
  reference: optionalText(200),
  note: optionalText(1000),
  /** True confirms immediately; false keeps the document as a draft. */
  confirm: z.boolean().default(false),
};

const uniqueProducts = (lines: { productId: number }[], context: z.RefinementCtx) => {
  const seen = new Set<number>();
  lines.forEach((line, index) => {
    if (seen.has(line.productId)) {
      context.addIssue({
        code: "custom",
        path: [index, "productId"],
        message: "Sản phẩm bị trùng trong phiếu",
      });
    }
    seen.add(line.productId);
  });
};

const linesOf = <T extends z.ZodType<{ productId: number }>>(line: T) =>
  z
    .array(line)
    .min(1, "Phiếu phải có ít nhất một sản phẩm")
    .max(MAX_DOCUMENT_LINES, `Mỗi phiếu tối đa ${MAX_DOCUMENT_LINES} dòng`)
    .superRefine(uniqueProducts);

const pricedLine = z.object({
  productId,
  quantity,
  /** Empty uses the product's current cost (imports) or sale price (exports). */
  unitPrice: money.nullish().transform((value) => value ?? null),
});

export const importSchema = z.object({ ...documentBase, lines: linesOf(pricedLine) });

const recipientId = idParam.nullish().transform((value) => value ?? null);

export const exportSchema = importSchema
  .extend({ customerId: recipientId, employeeId: recipientId })
  .superRefine((value, context) => {
    if (value.customerId && value.employeeId) {
      context.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "Chỉ chọn một người nhận",
      });
    }
    // Drafts may be saved first; stock only leaves once the recipient is known.
    if (value.confirm && !value.customerId && !value.employeeId) {
      context.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "Vui lòng chọn người nhận",
      });
    }
  });

export const adjustSchema = z.object({
  ...documentBase,
  reason: requiredText("lý do điều chỉnh", 300),
  lines: linesOf(
    z.object({
      productId,
      delta: z
        .number("Vui lòng nhập số lượng")
        .int("Số lượng phải là số nguyên")
        .min(-MAX_QUANTITY, "Số lượng quá lớn")
        .max(MAX_QUANTITY, "Số lượng quá lớn")
        .refine((value) => value !== 0, "Số lượng phải khác 0"),
    }),
  ),
});

export const reverseSchema = z.object({ reason: requiredText("lý do đảo ngược", 300) });

export const transactionListQuery = z.object({
  ...pageQuery,
  type: queryEnum(TRANSACTION_TYPES),
  status: queryEnum(TRANSACTION_STATUSES),
  from: queryDate,
  to: queryDate,
  productId: queryId,
  customerId: queryId,
  employeeId: queryId,
});

export type PricedDocumentInput = z.output<typeof importSchema>;
export type ExportDocumentInput = z.output<typeof exportSchema>;
export type PricedDocumentFormValues = z.input<typeof importSchema>;
export type AdjustInput = z.output<typeof adjustSchema>;
export type AdjustFormValues = z.input<typeof adjustSchema>;
export type TransactionListQuery = z.output<typeof transactionListQuery>;
