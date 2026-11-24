/**
 * Vai trò và quyền truy cập theo chức năng. Đây là nơi DUY NHẤT định nghĩa ai được vào đâu:
 * server dùng để chặn API (middleware requireModule), giao diện dùng để ẩn menu / trang.
 * Thêm vai trò mới: thêm vào ROLES, ROLE_LABELS và ROLE_MODULES.
 */
export const ROLES = ["admin", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị (toàn quyền)",
  employee: "Nhân viên",
};

export const MODULES = [
  "dashboard",
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
  employee: ["customers", "products", "inventory"],
};

export function canAccess(role: Role | null | undefined, module: Module): boolean {
  return Boolean(role && ROLE_MODULES[role].includes(module));
}

/**
 * Phạm vi khách hàng: vai trò "employee" chỉ thấy khách mình được phân công chăm sóc
 * hoặc khách do chính mình tạo. Admin thấy tất cả.
 */
export const seesAllCustomers = (role: Role) => role === "admin";

/** Hạng khách hàng mà chỉ Admin được đặt (thêm mới hoặc đổi sang / đổi khỏi hạng này). */
export const ADMIN_ONLY_TIERS: readonly string[] = ["vip"];

/** Vai trò có được đặt / thay đổi hạng `tier` cho khách hàng không. */
export const canAssignTier = (role: Role, tier: string) => role === "admin" || !ADMIN_ONLY_TIERS.includes(tier);
