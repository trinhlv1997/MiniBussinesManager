import {
  Boxes,
  ChartColumn,
  History,
  LayoutDashboard,
  Package,
  Settings,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { canAccess, type Module, type Role } from "@shared/permissions";

export type NavigationItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Chức năng cần quyền (shared/permissions.ts); không có = ai đăng nhập cũng vào được. */
  module?: Module;
  /** Không hiện trên menu bên trái (vẫn vào được bằng đường dẫn). */
  hidden?: boolean;
};

export const NAVIGATION: NavigationItem[] = [
  {
    path: "/",
    label: "Tổng quan",
    module: "dashboard",
    icon: LayoutDashboard,
    description: "Tình hình thiết bị điện, đồ điện tử, tồn kho và khách hàng của công ty.",
  },
  {
    path: "/nhan-vien",
    label: "Nhân viên",
    module: "employees",
    icon: Users,
    description: "Quản lý hồ sơ và trạng thái làm việc của nhân viên.",
  },
  {
    path: "/khach-hang",
    label: "Khách hàng",
    module: "customers",
    icon: UserRound,
    description: "Quản lý thông tin và ghi chú khách hàng.",
  },
  {
    path: "/san-pham",
    label: "Sản phẩm",
    module: "products",
    icon: Package,
    description: "Quản lý thiết bị điện, đồ điện tử, thương hiệu, bảo hành và giá bán.",
  },
  {
    path: "/kho",
    label: "Quản lý kho",
    module: "inventory",
    icon: Boxes,
    description: "Nhập kho, xuất kho, điều chỉnh và theo dõi tồn kho.",
  },
  {
    path: "/bao-cao",
    label: "Báo cáo",
    module: "reports",
    icon: ChartColumn,
    description: "Thống kê nhân sự, khách hàng, sản phẩm và kho hàng.",
  },
  {
    path: "/nguoi-dung",
    label: "Người dùng",
    module: "users",
    icon: UserCog,
    description: "Tài khoản đăng nhập, vai trò và nhân viên gắn với từng tài khoản.",
  },
  {
    path: "/nhat-ky",
    label: "Nhật ký hoạt động",
    module: "audit",
    icon: History,
    description: "Ai đã làm gì, lúc nào trên hệ thống.",
  },
  {
    path: "/cai-dat",
    label: "Cài đặt",
    module: "settings",
    icon: Settings,
    description: "Thông tin công ty và hệ thống.",
  },
  {
    path: "/tai-khoan",
    label: "Tài khoản của tôi",
    icon: UserRound,
    description: "Thông tin đăng nhập và đổi mật khẩu.",
    hidden: true,
  },
];

export const visibleNavigation = (role: Role | undefined) =>
  NAVIGATION.filter((item) => !item.hidden && (!item.module || canAccess(role, item.module)));

/** Trang đầu tiên vai trò được vào (Employee không có Tổng quan nên vào Khách hàng). */
export const homePathFor = (role: Role | undefined) => visibleNavigation(role)[0]?.path ?? "/tai-khoan";

export function findNavigationItem(pathname: string): NavigationItem | undefined {
  return NAVIGATION.find((item) =>
    item.path === "/" ? pathname === "/" : pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
}
