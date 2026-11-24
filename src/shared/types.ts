import type { Role } from "./permissions";
import type {
  CustomerTier,
  CustomerType,
  EmployeeStatus,
  ProductStatus,
  StockStatus,
  TransactionStatus,
  TransactionType,
} from "./labels";

export type Employee = {
  id: number;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  hireDate: string | null;
  status: EmployeeStatus;
  address: string | null;
  /** Lương cơ bản hằng tháng, VND nguyên; null khi chưa nhập. */
  baseSalary: number | null;
  note: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
};
export type EmployeeDetail = Employee & { avatar: string | null };

export type Customer = {
  id: number;
  code: string;
  name: string;
  type: CustomerType;
  tier: CustomerTier;
  /** Nhân viên chăm sóc; mã và tên lấy kèm để hiển thị, null khi chưa phân công. */
  careEmployeeId: number | null;
  careEmployeeCode: string | null;
  careEmployeeName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  note: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
};
export type CustomerNote = { id: number; content: string; createdAt: string };
export type CustomerDetail = Customer & { notes: CustomerNote[] };

export type ProductCategory = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  productCount: number;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  categoryId: number;
  categoryName: string;
  unit: string;
  costPrice: number;
  /** Giá khách lẻ. Giá đại lý / phân phối null = bằng giá lẻ (xem shared/pricing.ts). */
  salePrice: number;
  dealerPrice: number | null;
  distributorPrice: number | null;
  quantity: number;
  minStock: number;
  brand: string | null;
  specifications: string | null;
  warrantyMonths: number;
  description: string | null;
  status: ProductStatus;
  stockStatus: StockStatus;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
};
export type ProductDetail = Product & { image: string | null; hasHistory: boolean };

export type InventoryTransaction = {
  id: number;
  code: string;
  type: TransactionType;
  status: TransactionStatus;
  transactionDate: string;
  reference: string | null;
  customerId: number | null;
  employeeId: number | null;
  recipientCode: string | null;
  recipientName: string | null;
  reason: string | null;
  note: string | null;
  reversalOfId: number | null;
  confirmedAt: string | null;
  confirmedBy: number | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  lineCount: number;
  totalQuantity: number;
  totalAmount: number;
};

export type InventoryLine = {
  id: number;
  productId: number;
  sku: string;
  productName: string;
  unit: string;
  quantityDelta: number;
  unitPrice: number | null;
  amount: number | null;
};

export type InventoryTransactionDetail = InventoryTransaction & {
  lines: InventoryLine[];
  reversalOfCode: string | null;
  reversedBy: { id: number; code: string } | null;
};

export type CompanySettings = {
  companyName: string;
  logo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxCode: string | null;
  appName: string;
  dateFormat: string;
  currency: string;
  timezone: string;
};

export type StockAlertProduct = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  minStock: number;
};

export type DashboardSummary = {
  employees: number;
  customers: number;
  products: number;
  stockQuantity: number;
  stockValue: number;
  lowStock: number;
  outOfStock: number;
  importTransactions: number;
  exportTransactions: number;
  revenue: number;
  grossProfit: number;
  salesDocuments: number;
  lowStockProducts: StockAlertProduct[];
  outOfStockProducts: StockAlertProduct[];
  newCustomers: Pick<Customer, "id" | "code" | "name" | "type" | "createdAt">[];
  recentTransactions: Pick<
    InventoryTransaction,
    "id" | "code" | "type" | "transactionDate" | "totalQuantity"
  >[];
};

export type StockPoint = {
  period: string;
  imported: number;
  exported: number;
  adjusted: number;
  net: number;
  stock: number;
  value: number;
};

export type CategoryStock = {
  id: number;
  name: string;
  products: number;
  quantity: number;
  value: number;
};

export type SalesPoint = { period: string; revenue: number; grossProfit: number };

export type DashboardCharts = { series: StockPoint[]; categories: CategoryStock[]; sales: SalesPoint[] };

export type CountPoint = { period: string; count: number };

export type EmployeeReport = {
  total: number;
  active: number;
  onLeave: number;
  resigned: number;
  /** Tổng lương cơ bản của nhân viên đang làm việc. */
  activePayroll: number;
  hires: CountPoint[];
};

export type CustomerReport = {
  total: number;
  individual: number;
  business: number;
  vip: number;
  normal: number;
  basic: number;
  newInRange: number;
  series: CountPoint[];
};

export type ProductReport = {
  total: number;
  active: number;
  discontinued: number;
  lowStock: number;
  outOfStock: number;
  categories: CategoryStock[];
  lowStockProducts: StockAlertProduct[];
  outOfStockProducts: StockAlertProduct[];
};

export type InventoryHistoryRow = {
  id: number;
  code: string;
  type: TransactionType;
  transactionDate: string;
  sku: string;
  productName: string;
  categoryName: string;
  unit: string;
  quantityDelta: number;
  unitPrice: number | null;
  reference: string | null;
};

export type InventoryReport = {
  imported: number;
  exported: number;
  adjusted: number;
  stockQuantity: number;
  stockValue: number;
  series: StockPoint[];
  history: { items: InventoryHistoryRow[]; total: number; page: number; pageSize: number };
};

/** Tài khoản đăng nhập (màn hình Người dùng, chỉ Admin). */
export type UserAccount = {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  employeeId: number | null;
  employeeCode: string | null;
  employeeName: string | null;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

/** Tên người dùng để hiển thị "Tạo bởi …" (mọi tài khoản đăng nhập đều xem được). */
export type UserName = { id: number; displayName: string; active: boolean };

/** Ai tạo / sửa cuối bản ghi; thời gian lấy từ createdAt / updatedAt của bản ghi. */
export type Authorship = { createdBy: number | null; updatedBy: number | null };

export type AuditEntry = {
  id: number;
  createdAt: string;
  actorId: number | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  /** Mã đối tượng (KH0001, PX-000012…) nếu nhật ký có lưu. */
  entityCode: string | null;
};
