import {
  Boxes,
  ChartColumn,
  LayoutDashboard,
  Package,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

export const NAVIGATION: NavigationItem[] = [
  {
    path: "/",
    label: "Tổng quan",
    icon: LayoutDashboard,
    description: "Tình hình thiết bị điện, đồ điện tử, tồn kho và khách hàng của công ty.",
  },
  {
    path: "/nhan-vien",
    label: "Nhân viên",
    icon: Users,
    description: "Quản lý hồ sơ và trạng thái làm việc của nhân viên.",
  },
  {
    path: "/khach-hang",
    label: "Khách hàng",
    icon: UserRound,
    description: "Quản lý thông tin và ghi chú khách hàng.",
  },
  {
    path: "/san-pham",
    label: "Sản phẩm",
    icon: Package,
    description: "Quản lý thiết bị điện, đồ điện tử, thương hiệu, bảo hành và giá bán.",
  },
  {
    path: "/kho",
    label: "Quản lý kho",
    icon: Boxes,
    description: "Nhập kho, xuất kho, điều chỉnh và theo dõi tồn kho.",
  },
  {
    path: "/bao-cao",
    label: "Báo cáo",
    icon: ChartColumn,
    description: "Thống kê nhân sự, khách hàng, sản phẩm và kho hàng.",
  },
  {
    path: "/cai-dat",
    label: "Cài đặt",
    icon: Settings,
    description: "Thông tin công ty, hệ thống và tài khoản.",
  },
];

export function findNavigationItem(pathname: string): NavigationItem | undefined {
  return NAVIGATION.find((item) =>
    item.path === "/" ? pathname === "/" : pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
}
