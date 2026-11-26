import type { TaskHistoryField, TaskPriority, TaskStatus } from "./tasks";
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
  /** null khi tài khoản không được xem giá nhập (Nhân viên). */
  costPrice: number | null;
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
  /** null khi phiếu có giá nhập mà tài khoản không được xem (Nhân viên). */
  totalAmount: number | null;
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

/** Thẻ công việc trên Kanban / danh sách. Tên, ảnh người nhận lấy từ danh sách TaskPerson. */
export type Task = {
  id: number;
  title: string;
  description: string | null;
  assigneeId: number;
  assignerId: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string | null;
  dueDate: string;
  requiresReview: boolean;
  /** Nhân viên đã gửi yêu cầu hủy, đang chờ Quản lý / Admin xử lý. */
  cancelRequestedAt: string | null;
  cancelRequestReason: string | null;
  cancelRequestedBy: number | null;
  completedAt: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskHistoryEntry = {
  id: number;
  actorId: number | null;
  field: TaskHistoryField;
  oldValue: string | null;
  newValue: string | null;
  /** Lý do người dùng ghi khi đổi trạng thái (không bắt buộc). */
  note: string | null;
  createdAt: string;
};

export type TaskDetail = Task & { history: TaskHistoryEntry[] };

/** Người xuất hiện trên task (người nhận / người giao) mà tài khoản hiện tại được thấy. */
export type TaskPerson = {
  id: number;
  displayName: string;
  role: Role;
  active: boolean;
  /** Ảnh đại diện của hồ sơ nhân viên gắn với tài khoản (data URL), nếu có. */
  avatar: string | null;
  /** Tài khoản hiện tại có được giao việc cho người này không. */
  assignable: boolean;
};

export type Team = {
  id: number;
  name: string;
  description: string | null;
  managerId: number | null;
  memberIds: number[];
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Người có thể đưa vào nhóm: mọi tài khoản và mọi hồ sơ nhân viên chưa có tài khoản
 * (userId = null; Quản trị tạo tài khoản cho họ ngay khi thêm vào nhóm).
 */
export type TeamCandidate = {
  key: string;
  userId: number | null;
  username: string | null;
  role: Role | null;
  active: boolean;
  employeeId: number | null;
  employeeCode: string | null;
  name: string;
  position: string | null;
  /** Nhóm hiện tại của tài khoản (null = chưa thuộc nhóm nào). */
  teamId: number | null;
};
