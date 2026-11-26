/**
 * Vai trò và quyền truy cập theo chức năng. Đây là nơi DUY NHẤT định nghĩa ai được vào đâu:
 * server dùng để chặn API (middleware requireModule), giao diện dùng để ẩn menu / trang.
 * Thêm vai trò mới: thêm vào ROLES, ROLE_LABELS và ROLE_MODULES.
 */
export const ROLES = ["admin", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị (toàn quyền)",
  manager: "Quản lý",
  employee: "Nhân viên",
};

export const MODULES = [
  "dashboard",
  "tasks",
  "teams",
  "employees",
  "customers",
  "products",
  "inventory",
  "reports",
  "settings",
  "users",
  "audit",
] as const;
export type Module = (typeof MODULES)[number];

const ROLE_MODULES: Record<Role, readonly Module[]> = {
  admin: MODULES,
  // Quản lý: như Nhân viên + Báo cáo, và quản lý công việc của nhóm mình (xem shared/tasks.ts).
  // "teams" với Quản lý: chỉ xem nhóm mình và thêm / bớt thành viên (services/teams.ts kiểm tra).
  manager: ["tasks", "teams", "customers", "products", "inventory", "reports"],
  employee: ["tasks", "customers", "products", "inventory"],
};

export function canAccess(role: Role | null | undefined, module: Module): boolean {
  return Boolean(role && ROLE_MODULES[role].includes(module));
}

/**
 * Phạm vi khách hàng: vai trò "employee" chỉ thấy khách mình được phân công chăm sóc
 * hoặc khách do chính mình tạo. Admin thấy tất cả.
 */
export const seesAllCustomers = (role: Role) => role === "admin";

/** Hạng khách hàng chỉ Quản trị và Quản lý được đặt (thêm mới hoặc đổi sang / đổi khỏi hạng này). */
export const RESTRICTED_TIERS: readonly string[] = ["vip"];

/** Vai trò có được đặt / thay đổi hạng `tier` cho khách hàng không. */
export const canAssignTier = (role: Role, tier: string) => role === "admin" || role === "manager" || !RESTRICTED_TIERS.includes(tier);

/** Thêm / sửa / xoá Sản phẩm và Danh mục: Quản trị và Quản lý. Nhân viên chỉ xem. */
export const canManageCatalog = (role: Role) => role !== "employee";

/**
 * Giá nhập (giá vốn) chỉ Quản trị và Quản lý được xem. Với Nhân viên, server bỏ giá nhập khỏi mọi phản hồi:
 * sản phẩm, tồn kho (giá trị tồn), đơn giá / thành tiền của phiếu nhập và phiếu đảo ngược, file Excel.
 */
export const canSeeCostPrice = (role: Role) => role !== "employee";

/**
 * Phiếu nhập kho (tạo, sửa nháp, xác nhận, hủy, đảo ngược): chỉ Quản trị và Quản lý, vì đơn giá phiếu nhập
 * chính là giá nhập. Nhân viên vẫn xem được danh sách phiếu nhập (đã ẩn tiền), vẫn Xuất kho và Điều chỉnh.
 */
export const canImportStock = (role: Role) => role !== "employee";
