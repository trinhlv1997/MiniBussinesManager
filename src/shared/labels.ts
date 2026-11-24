export const EMPLOYEE_STATUSES = ["active", "on_leave", "resigned"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Đang làm việc",
  on_leave: "Tạm nghỉ",
  resigned: "Đã nghỉ việc",
};

export const CUSTOMER_TYPES = ["individual", "business"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  individual: "Cá nhân",
  business: "Doanh nghiệp",
};

/** Hạng khách hàng theo kênh bán, từ cao xuống thấp (thứ tự này dùng cho ô chọn). */
export const CUSTOMER_TIERS = ["vip", "normal", "basic"] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];
export const CUSTOMER_TIER_LABELS: Record<CustomerTier, string> = {
  vip: "VIP (Nhà phân phối)",
  normal: "Bình thường (Đại lý)",
  basic: "Cơ bản (Khách lẻ)",
};

export const PRODUCT_STATUSES = ["active", "discontinued"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Đang kinh doanh",
  discontinued: "Ngừng kinh doanh",
};

export const STOCK_STATUSES = ["in_stock", "low_stock", "out_of_stock"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];
export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: "Còn hàng",
  low_stock: "Sắp hết hàng",
  out_of_stock: "Hết hàng",
};

export function stockStatusOf(quantity: number, minStock: number): StockStatus {
  if (quantity <= 0) return "out_of_stock";
  return quantity <= minStock ? "low_stock" : "in_stock";
}

export const TRANSACTION_TYPES = ["import", "export", "adjust", "reversal"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  import: "Nhập kho",
  export: "Xuất kho",
  adjust: "Điều chỉnh",
  reversal: "Đảo ngược",
};

export const TRANSACTION_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  cancelled: "Đã hủy",
};

export const PRODUCT_UNITS = ["Cái", "Chiếc", "Bộ", "Cuộn", "Mét", "Cây", "Hộp", "Thùng", "Kg"] as const;

export const warrantyLabel = (months: number) => (months > 0 ? `${months} tháng` : "Không bảo hành");
