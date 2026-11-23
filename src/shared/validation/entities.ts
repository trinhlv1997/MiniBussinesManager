import { z } from "zod";
import {
  CUSTOMER_TIERS,
  CUSTOMER_TYPES,
  EMPLOYEE_STATUSES,
  PRODUCT_STATUSES,
  STOCK_STATUSES,
} from "../labels";
import {
  MAX_QUANTITY,
  idParam,
  money,
  optionalCode,
  optionalDate,
  optionalEmail,
  optionalImage,
  optionalMoney,
  optionalPhone,
  optionalText,
  pageQuery,
  queryDate,
  queryEnum,
  queryId,
  requiredText,
  sortQuery,
} from "./common";

export const employeeSchema = z.object({
  code: optionalCode,
  fullName: requiredText("họ và tên", 120),
  phone: optionalPhone,
  email: optionalEmail,
  position: optionalText(100),
  hireDate: optionalDate,
  status: z.enum(EMPLOYEE_STATUSES, "Trạng thái không hợp lệ"),
  address: optionalText(300),
  baseSalary: optionalMoney,
  note: optionalText(2000),
  avatar: optionalImage,
});

export const employeeListQuery = z.object({
  ...pageQuery,
  status: queryEnum(EMPLOYEE_STATUSES),
  sort: sortQuery(["code", "fullName", "hireDate", "status", "baseSalary", "createdAt"], "createdAt"),
});

export const customerSchema = z.object({
  code: optionalCode,
  name: requiredText("tên khách hàng", 200),
  type: z.enum(CUSTOMER_TYPES, "Loại khách hàng không hợp lệ"),
  tier: z.enum(CUSTOMER_TIERS, "Hạng khách hàng không hợp lệ").default("normal"),
  contactName: optionalText(120),
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(300),
  taxCode: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null)
    .refine((value) => value === null || /^\d{10}(-\d{3})?$/.test(value), {
      message: "Mã số thuế gồm 10 số, có thể thêm -xxx",
    }),
  note: optionalText(2000),
});

export const customerNoteSchema = z.object({ content: requiredText("nội dung ghi chú", 2000) });

export const customerListQuery = z.object({
  ...pageQuery,
  type: queryEnum(CUSTOMER_TYPES),
  tier: queryEnum(CUSTOMER_TIERS),
  createdFrom: queryDate,
  createdTo: queryDate,
  sort: sortQuery(["code", "name", "type", "tier", "createdAt"], "createdAt"),
});

export const categorySchema = z.object({
  code: optionalCode,
  name: requiredText("tên danh mục", 100),
  description: optionalText(500),
});

export const productSchema = z.object({
  sku: optionalCode,
  name: requiredText("tên sản phẩm", 200),
  categoryId: idParam,
  unit: requiredText("đơn vị tính", 20),
  costPrice: money,
  salePrice: money,
  minStock: z
    .number("Vui lòng nhập số lượng")
    .int("Số lượng phải là số nguyên")
    .min(0, "Số lượng không được âm")
    .max(MAX_QUANTITY, "Số lượng quá lớn"),
  brand: optionalText(100),
  specifications: optionalText(300),
  warrantyMonths: z
    .number("Vui lòng nhập số tháng bảo hành")
    .int("Số tháng phải là số nguyên")
    .min(0, "Số tháng không được âm")
    .max(120, "Bảo hành tối đa 120 tháng")
    .default(0),
  description: optionalText(2000),
  status: z.enum(PRODUCT_STATUSES, "Trạng thái không hợp lệ"),
  image: optionalImage,
});

export const productListQuery = z.object({
  ...pageQuery,
  categoryId: queryId,
  status: queryEnum(PRODUCT_STATUSES),
  stockStatus: queryEnum(STOCK_STATUSES),
  sort: sortQuery(
    ["sku", "name", "quantity", "costPrice", "salePrice", "createdAt"],
    "createdAt",
  ),
});

export type EmployeeInput = z.output<typeof employeeSchema>;
export type EmployeeFormValues = z.input<typeof employeeSchema>;
export type EmployeeListQuery = z.output<typeof employeeListQuery>;
export type CustomerInput = z.output<typeof customerSchema>;
export type CustomerFormValues = z.input<typeof customerSchema>;
export type CustomerListQuery = z.output<typeof customerListQuery>;
export type CategoryInput = z.output<typeof categorySchema>;
export type CategoryFormValues = z.input<typeof categorySchema>;
export type ProductInput = z.output<typeof productSchema>;
export type ProductFormValues = z.input<typeof productSchema>;
export type ProductListQuery = z.output<typeof productListQuery>;
