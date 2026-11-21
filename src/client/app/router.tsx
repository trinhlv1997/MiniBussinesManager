import { lazy, Suspense } from "react";
import { createBrowserRouter, useRouteError } from "react-router";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { AppLayout } from "@/components/layout/app-layout";

const LoginPage = lazy(() => import("@/pages/login-page"));
const DashboardPage = lazy(() => import("@/pages/dashboard-page"));
const EmployeesPage = lazy(() => import("@/pages/employees-page"));
const CustomersPage = lazy(() => import("@/pages/customers-page"));
const ProductsPage = lazy(() => import("@/pages/products-page"));
const InventoryPage = lazy(() => import("@/pages/inventory-page"));
const ReportsPage = lazy(() => import("@/pages/reports-page"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));
const NotFoundPage = lazy(() => import("@/pages/not-found-page"));

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
      { path: "/", element: <DashboardPage /> },
      { path: "/nhan-vien", element: <EmployeesPage /> },
      { path: "/khach-hang", element: <CustomersPage /> },
      { path: "/san-pham", element: <ProductsPage /> },
      { path: "/kho", element: <InventoryPage /> },
      { path: "/bao-cao", element: <ReportsPage /> },
      { path: "/cai-dat", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
