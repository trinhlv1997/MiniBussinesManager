import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CircleOff, Coins, Package, TriangleAlert, UserCheck, UserMinus, UserPlus, Users, Building2, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatDate, formatNumber, formatVnd } from "@shared/format";
import { TRANSACTION_TYPE_LABELS } from "@shared/labels";
import type {
  CustomerReport,
  EmployeeReport,
  InventoryHistoryRow,
  InventoryReport,
  ProductReport,
  StockAlertProduct,
} from "@shared/types";
import { CategoryChart, ChartCard, CountChart, MovementChart, TrendChart } from "@/components/charts/lazy-charts";
import { DataTable, type Column } from "@/components/common/data-table";
import { DateRangeFilter } from "@/components/common/date-picker";
import { ExportButton, FilterSelect, Toolbar } from "@/components/common/list-controls";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { StatCard } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductCombobox } from "@/features/inventory/product-combobox";
import { categoryOptions, useCategories } from "@/features/products/product-dialogs";
import { useDateRange } from "@/hooks/use-date-range";
import { useListParams } from "@/hooks/use-list-params";
import { apiRequest } from "@/lib/api";
import { toQueryString, type QueryParams } from "@/lib/resource";

function useReport<T>(kind: string, params: QueryParams) {
  return useQuery({
    queryKey: ["reports", kind, params],
    queryFn: () => apiRequest<T>(`/reports/${kind}${toQueryString(params)}`),
  });
}

function ReportBody<T>({
  report,
  children,
}: {
  report: ReturnType<typeof useReport<T>>;
  children: (data: T) => ReactNode;
}) {
  if (report.error) return <ErrorState description={report.error.message} onRetry={() => report.refetch()} />;
  if (!report.data) return <PageSkeleton />;
  return <div className="space-y-4">{children(report.data)}</div>;
}

const StatGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
);

function EmployeesReportTab() {
  const { from, to } = useDateRange();
  const params = { from, to };
  const report = useReport<EmployeeReport>("employees", params);
  return (
    <>
      <Toolbar>
        <DateRangeFilter />
        <ExportButton path="/reports/employees/export" fileName="bao-cao-nhan-vien" />
      </Toolbar>
      <ReportBody report={report}>
        {(data) => (
          <>
            <StatGrid>
              <StatCard label="Tổng nhân viên" icon={Users} value={formatNumber(data.total)} />
              <StatCard label="Đang làm việc" icon={UserCheck} value={formatNumber(data.active)} />
              <StatCard label="Tạm nghỉ" icon={UserMinus} value={formatNumber(data.onLeave)} />
              <StatCard label="Đã nghỉ việc" icon={UserMinus} value={formatNumber(data.resigned)} />
            </StatGrid>
            <ChartCard title="Nhân viên vào làm theo thời gian">
              <CountChart data={data.hires} name="Nhân viên mới" />
            </ChartCard>
          </>
        )}
      </ReportBody>
    </>
  );
}

function CustomersReportTab() {
  const { from, to } = useDateRange();
  const params = { from, to };
  const report = useReport<CustomerReport>("customers", params);
  return (
    <>
      <Toolbar>
        <DateRangeFilter />
        <ExportButton path={`/reports/customers/export${toQueryString(params)}`} fileName="bao-cao-khach-hang" />
      </Toolbar>
      <ReportBody report={report}>
        {(data) => (
          <>
            <StatGrid>
              <StatCard label="Tổng khách hàng" icon={Users} value={formatNumber(data.total)} />
              <StatCard label="Khách hàng cá nhân" icon={UserRound} value={formatNumber(data.individual)} />
              <StatCard label="Khách hàng doanh nghiệp" icon={Building2} value={formatNumber(data.business)} />
              <StatCard label="Khách hàng mới" icon={UserPlus} value={formatNumber(data.newInRange)} note="Trong khoảng đã chọn" />
            </StatGrid>
            <ChartCard title="Khách hàng mới theo thời gian">
              <CountChart data={data.series} name="Khách hàng mới" />
            </ChartCard>
          </>
        )}
      </ReportBody>
    </>
  );
}

const alertColumns: Column<StockAlertProduct>[] = [
  { key: "sku", header: "Mã SKU", cell: (row) => row.sku },
  { key: "name", header: "Sản phẩm", cell: (row) => row.name },
  { key: "quantity", header: "Tồn kho", className: "text-right", cell: (row) => `${formatNumber(row.quantity)} ${row.unit}` },
  { key: "min", header: "Tối thiểu", className: "text-right", cell: (row) => formatNumber(row.minStock) },
];

function CategoryFilter() {
  const params = useListParams();
  const categories = useCategories();
  return (
    <FilterSelect
      label="Lọc theo danh mục"
      allLabel="Tất cả danh mục"
      value={params.get("categoryId")}
      options={categoryOptions(categories.data)}
      onChange={(categoryId) => params.update({ categoryId, productId: undefined })}
    />
  );
}

function ProductsReportTab() {
  const { get } = useListParams();
  const params = { categoryId: get("categoryId") };
  const report = useReport<ProductReport>("products", params);
  return (
    <>
      <Toolbar>
        <CategoryFilter />
        <ExportButton path={`/reports/products/export${toQueryString(params)}`} fileName="bao-cao-san-pham" />
      </Toolbar>
      <ReportBody report={report}>
        {(data) => (
          <>
            <StatGrid>
              <StatCard label="Tổng sản phẩm" icon={Package} value={formatNumber(data.total)} />
              <StatCard label="Đang kinh doanh" icon={Boxes} value={formatNumber(data.active)} />
              <StatCard label="Sắp hết hàng" icon={TriangleAlert} value={formatNumber(data.lowStock)} />
              <StatCard label="Hết hàng" icon={CircleOff} value={formatNumber(data.outOfStock)} />
            </StatGrid>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Sản phẩm theo danh mục">
                <CategoryChart data={data.categories} dataKey="products" name="Số sản phẩm" />
              </ChartCard>
              <ChartCard title="Giá trị tồn theo danh mục">
                <CategoryChart data={data.categories} dataKey="value" name="Giá trị tồn" money />
              </ChartCard>
            </div>
            <h2 className="pt-2 text-sm font-semibold">Sản phẩm hết hàng</h2>
            <DataTable columns={alertColumns} rows={data.outOfStockProducts} rowKey={(row) => row.id} isLoading={false} emptyTitle="Không có sản phẩm hết hàng" />
            <h2 className="pt-2 text-sm font-semibold">Sản phẩm sắp hết hàng</h2>
            <DataTable columns={alertColumns} rows={data.lowStockProducts} rowKey={(row) => row.id} isLoading={false} emptyTitle="Không có sản phẩm sắp hết hàng" />
          </>
        )}
      </ReportBody>
    </>
  );
}

const historyColumns: Column<InventoryHistoryRow>[] = [
  { key: "date", header: "Ngày", cell: (row) => formatDate(row.transactionDate) },
  { key: "code", header: "Mã phiếu", cell: (row) => row.code },
  { key: "type", header: "Loại", className: "hidden md:table-cell", cell: (row) => TRANSACTION_TYPE_LABELS[row.type] },
  { key: "product", header: "Sản phẩm", cell: (row) => row.productName },
  { key: "category", header: "Danh mục", className: "hidden lg:table-cell", cell: (row) => row.categoryName },
  {
    key: "delta",
    header: "Thay đổi",
    className: "text-right",
    cell: (row) => (
      <span className="tabular-nums">
        {row.quantityDelta > 0 ? "+" : "-"}{formatNumber(Math.abs(row.quantityDelta))} {row.unit}
      </span>
    ),
  },
];

function InventoryReportTab() {
  const list = useListParams();
  const { from, to } = useDateRange();
  const [productLabel, setProductLabel] = useState("");
  const filters = { from, to, categoryId: list.get("categoryId"), productId: list.get("productId") };
  const report = useReport<InventoryReport>("inventory", { ...filters, page: list.get("page") });
  return (
    <>
      <Toolbar>
        <DateRangeFilter />
        <CategoryFilter />
        <div className="w-full sm:w-60">
          <ProductCombobox
            label={list.get("productId") ? productLabel || "Sản phẩm đã chọn" : ""}
            placeholder="Tất cả sản phẩm"
            ariaLabel="Lọc theo sản phẩm"
            onSelect={(product) => {
              setProductLabel(product.name);
              list.update({ productId: product.id });
            }}
          />
        </div>
        {list.get("productId") && (
          <Button variant="ghost" onClick={() => list.update({ productId: undefined })}>Bỏ lọc sản phẩm</Button>
        )}
        <ExportButton path={`/reports/inventory/export${toQueryString(filters)}`} fileName="bao-cao-kho" />
      </Toolbar>
      <ReportBody report={report}>
        {(data) => (
          <>
            <StatGrid>
              <StatCard label="Tổng lượng nhập" icon={ArrowDownToLine} value={formatNumber(data.imported)} />
              <StatCard label="Tổng lượng xuất" icon={ArrowUpFromLine} value={formatNumber(data.exported)} />
              <StatCard label="Số lượng tồn hiện tại" icon={Boxes} value={formatNumber(data.stockQuantity)} />
              <StatCard label="Giá trị tồn kho" icon={Coins} value={formatVnd(data.stockValue)} />
            </StatGrid>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Nhập kho và xuất kho">
                <MovementChart data={data.series} />
              </ChartCard>
              <ChartCard title="Biến động tồn kho">
                <TrendChart data={data.series} dataKey="stock" name="Số lượng tồn" />
              </ChartCard>
            </div>
            <h2 className="pt-2 text-sm font-semibold">Lịch sử giao dịch</h2>
            <DataTable
              columns={historyColumns}
              rows={data.history.items}
              rowKey={(row) => row.id}
              isLoading={false}
              params={list}
              pagination={{
                page: data.history.page,
                pageSize: data.history.pageSize,
                total: data.history.total,
                totalPages: Math.max(1, Math.ceil(data.history.total / data.history.pageSize)),
              }}
              emptyTitle="Không có giao dịch trong khoảng này"
            />
          </>
        )}
      </ReportBody>
    </>
  );
}

export default function ReportsPage() {
  const params = useListParams();
  const tab = params.get("tab") || "inventory";
  return (
    <>
      <PageHeader title="Báo cáo" description="Thống kê nhân sự, khách hàng, sản phẩm và kho hàng." />
      <Tabs value={tab} onValueChange={(next) => params.update({ tab: next, categoryId: undefined, productId: undefined })}>
        <TabsList className="mb-4">
          <TabsTrigger value="inventory">Kho</TabsTrigger>
          <TabsTrigger value="products">Sản phẩm</TabsTrigger>
          <TabsTrigger value="customers">Khách hàng</TabsTrigger>
          <TabsTrigger value="employees">Nhân viên</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory"><InventoryReportTab /></TabsContent>
        <TabsContent value="products"><ProductsReportTab /></TabsContent>
        <TabsContent value="customers"><CustomersReportTab /></TabsContent>
        <TabsContent value="employees"><EmployeesReportTab /></TabsContent>
      </Tabs>
    </>
  );
}
