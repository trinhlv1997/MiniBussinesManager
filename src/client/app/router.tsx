import { lazy, Suspense } from "react";
import { Navigate, createBrowserRouter, useRouteError } from "react-router";
import type { Module } from "@shared/permissions";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { AppLayout } from "@/components/layout/app-layout";
import { useCan, useSession } from "@/features/auth/use-auth";
import { homePathFor } from "./navigation";

const LoginPage = lazy(() => import("@/pages/login-page"));
const DashboardPage = lazy(() => import("@/pages/dashboard-page"));
const EmployeesPage = lazy(() => import("@/pages/employees-page"));
const CustomersPage = lazy(() => import("@/pages/customers-page"));
const ProductsPage = lazy(() => import("@/pages/products-page"));
const InventoryPage = lazy(() => import("@/pages/inventory-page"));
const ReportsPage = lazy(() => import("@/pages/reports-page"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));
const NotFoundPage = lazy(() => import("@/pages/not-found-page"));
const AccountPage = lazy(() => import("@/pages/account-page"));
const UsersPage = lazy(() => import("@/pages/users-page"));
const AuditPage = lazy(() => import("@/pages/audit-page"));

/** Trang không thuộc quyền của vai trò thì chuyển về trang đầu tiên được phép (server vẫn tự chặn API). */
function Guard({ module, children }: { module: Module; children: React.ReactNode }) {
  const can = useCan();
  const { data } = useSession();
  return can(module) ? children : <Navigate to={homePathFor(data?.role)} replace />;
}

function RouteError() {
  const error = useRouteError();
  console.error(error);
  return (
    <ErrorState
      title="Trang gặp lỗi"
      description="Vui lòng tải lại trang và thử lại."
      onRetry={() => window.location.reload()}
    />
  );
}

export const router = createBrowserRouter([
  {
    path: "/dang-nhap",
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <Guard module="dashboard"><DashboardPage /></Guard> },
      { path: "/nhan-vien", element: <Guard module="employees"><EmployeesPage /></Guard> },
      { path: "/khach-hang", element: <Guard module="customers"><CustomersPage /></Guard> },
      { path: "/san-pham", element: <Guard module="products"><ProductsPage /></Guard> },
      { path: "/kho", element: <Guard module="inventory"><InventoryPage /></Guard> },
      { path: "/bao-cao", element: <Guard module="reports"><ReportsPage /></Guard> },
      { path: "/nguoi-dung", element: <Guard module="users"><UsersPage /></Guard> },
      { path: "/nhat-ky", element: <Guard module="audit"><AuditPage /></Guard> },
      { path: "/cai-dat", element: <Guard module="settings"><SettingsPage /></Guard> },
      { path: "/tai-khoan", element: <AccountPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
