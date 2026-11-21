import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CircleOff,
  ClipboardList,
  Coins,
  Package,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { formatDate, formatNumber, formatVnd } from "@shared/format";
import type { DashboardCharts, DashboardSummary, StockAlertProduct } from "@shared/types";
import { CategoryChart, ChartCard, MovementChart, SalesChart, TrendChart } from "@/components/charts/lazy-charts";
import { DateRangeFilter } from "@/components/common/date-picker";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState } from "@/components/common/states";
import {
  CustomerTypeBadge,
  DocumentTypeBadge,
  IconChip,
  StatCard,
  StatusBadge,
  type StatTone,
} from "@/components/common/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateRange } from "@/hooks/use-date-range";
import { apiRequest } from "@/lib/api";
import { toQueryString } from "@/lib/resource";

const IMPORTANT_CHART = "var(--primary)";
const SECONDARY_CHART = "var(--chart-neutral)";

function ListCard({
  title,
  icon,
  tone,
  to,
  empty,
  loading,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: StatTone;
  to: string;
  empty: string;
  loading: boolean;
  children: ReactNode[] | undefined;
}) {
  return (
    <Card className="min-w-0 gap-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <IconChip icon={icon} tone={tone} />
          {title}
        </CardTitle>
        <Link to={to} className="text-sm text-primary hover:underline">Xem tất cả</Link>
      </CardHeader>
      <CardContent>
        {loading && <Skeleton className="h-32 w-full" />}
        {children?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>}
        {children && children.length > 0 && <ul className="divide-y">{children}</ul>}
      </CardContent>
    </Card>
  );
}

const Row = ({ title, subtitle, end }: { title: string; subtitle: string; end: ReactNode }) => (
  <li className="flex items-center justify-between gap-3 py-2 text-sm">
    <div className="min-w-0">
      <p className="truncate">{title}</p>
      <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
    </div>
    <span className="shrink-0 text-right tabular-nums">{end}</span>
  </li>
);

const stockRow = (tone: "warning" | "danger") => (product: StockAlertProduct) => (
  <Row
    key={product.id}
    title={product.name}
    subtitle={`${product.sku} · Tối thiểu ${formatNumber(product.minStock)}`}
    end={<StatusBadge tone={tone}>{formatNumber(product.quantity)} {product.unit}</StatusBadge>}
  />
);

// Alerts turn green once there is nothing left to act on.
const alertTone = (count: number | undefined, tone: StatTone): StatTone => {
  if (count === undefined) return "neutral";
  return count > 0 ? tone : "success";
};

function profitNote({ revenue, grossProfit }: DashboardSummary) {
  if (revenue === 0) return "Chưa có doanh thu trong khoảng này";
  const margin = ((grossProfit / revenue) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  return `Doanh thu trừ giá vốn · Biên ${margin}%`;
}

export default function DashboardPage() {
  const { from, to } = useDateRange();
  const query = toQueryString({ from, to });
  const summary = useQuery({
    queryKey: ["dashboard", "summary", from, to],
    queryFn: () => apiRequest<DashboardSummary>(`/dashboard/summary${query}`),
  });
  const charts = useQuery({
    queryKey: ["dashboard", "charts", from, to],
    queryFn: () => apiRequest<DashboardCharts>(`/dashboard/charts${query}`),
  });
  const data = summary.data;
  const loading = summary.isPending;
  const number = (value?: number) => (value === undefined ? "" : formatNumber(value));
  const isLoss = (data?.grossProfit ?? 0) < 0;

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description="Tình hình thiết bị điện, đồ điện tử, tồn kho và khách hàng của công ty."
        actions={<DateRangeFilter />}
      />
      {summary.error ? (
        <ErrorState description={summary.error.message} onRetry={() => summary.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                loading={loading}
                tone="primary"
                label="Doanh thu"
                icon={ReceiptText}
                value={data ? formatVnd(data.revenue) : ""}
                note={data ? `${formatNumber(data.salesDocuments)} phiếu bán trong khoảng đã chọn` : undefined}
              />
              <StatCard
                loading={loading}
                tone={isLoss ? "danger" : "positive"}
                label={isLoss ? "Lỗ gộp" : "Lợi nhuận gộp"}
                icon={isLoss ? TrendingDown : TrendingUp}
                value={data ? formatVnd(data.grossProfit) : ""}
                note={data ? profitNote(data) : undefined}
              />
              <StatCard
                loading={loading}
                tone="primary"
                label="Giá trị tồn kho"
                icon={Coins}
                value={data ? formatVnd(data.stockValue) : ""}
                note="Tính theo giá nhập hiện tại"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard loading={loading} label="Tổng nhân viên" icon={Users} value={number(data?.employees)} />
              <StatCard loading={loading} label="Tổng khách hàng" icon={UserRound} value={number(data?.customers)} />
              <StatCard loading={loading} label="Tổng sản phẩm" icon={Package} value={number(data?.products)} />
              <StatCard loading={loading} tone="info" label="Tổng số lượng tồn" icon={Boxes} value={number(data?.stockQuantity)} />
              <StatCard loading={loading} tone={alertTone(data?.lowStock, "warning")} label="Sắp hết hàng" icon={TriangleAlert} value={number(data?.lowStock)} />
              <StatCard loading={loading} tone={alertTone(data?.outOfStock, "danger")} label="Hết hàng" icon={CircleOff} value={number(data?.outOfStock)} />
              <StatCard loading={loading} tone="import" label="Giao dịch nhập kho" icon={ArrowDownToLine} value={number(data?.importTransactions)} note="Trong khoảng đã chọn" />
              <StatCard loading={loading} tone="export" label="Giao dịch xuất kho" icon={ArrowUpFromLine} value={number(data?.exportTransactions)} note="Trong khoảng đã chọn" />
            </div>
          </div>

          {charts.error ? (
            <ErrorState description={charts.error.message} onRetry={() => charts.refetch()} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Doanh thu và lợi nhuận gộp" loading={charts.isPending} className="lg:col-span-2">
                {charts.data && <SalesChart data={charts.data.sales} />}
              </ChartCard>
              <ChartCard title="Nhập kho và xuất kho theo thời gian" loading={charts.isPending}>
                {charts.data && <MovementChart data={charts.data.series} />}
              </ChartCard>
              <ChartCard title="Số lượng sản phẩm theo danh mục" loading={charts.isPending}>
                {charts.data && <CategoryChart data={charts.data.categories} dataKey="products" name="Số sản phẩm" color={SECONDARY_CHART} />}
              </ChartCard>
              <ChartCard title="Giá trị tồn kho" loading={charts.isPending}>
                {charts.data && <TrendChart data={charts.data.series} dataKey="value" name="Giá trị tồn kho" money color={IMPORTANT_CHART} />}
              </ChartCard>
              <ChartCard title="Biến động tồn kho" loading={charts.isPending}>
                {charts.data && <TrendChart data={charts.data.series} dataKey="stock" name="Số lượng tồn" color={IMPORTANT_CHART} />}
              </ChartCard>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ListCard title="Sản phẩm sắp hết hàng" icon={TriangleAlert} tone={alertTone(data?.lowStock, "warning")} to="/kho?tab=alerts" empty="Không có sản phẩm sắp hết." loading={loading}>
              {data?.lowStockProducts.map(stockRow("warning"))}
            </ListCard>
            <ListCard title="Sản phẩm hết hàng" icon={CircleOff} tone={alertTone(data?.outOfStock, "danger")} to="/kho?tab=alerts" empty="Không có sản phẩm hết hàng." loading={loading}>
              {data?.outOfStockProducts.map(stockRow("danger"))}
            </ListCard>
            <ListCard title="Khách hàng mới" icon={UserPlus} tone="neutral" to="/khach-hang" empty="Không có khách hàng mới trong khoảng này." loading={loading}>
              {data?.newCustomers.map((customer) => (
                <Row
                  key={customer.id}
                  title={customer.name}
                  subtitle={`${customer.code} · ${formatDate(customer.createdAt)}`}
                  end={<CustomerTypeBadge type={customer.type} />}
                />
              ))}
            </ListCard>
            <ListCard title="Giao dịch kho gần đây" icon={ClipboardList} tone="neutral" to="/kho?tab=history" empty="Chưa có giao dịch kho." loading={loading}>
              {data?.recentTransactions.map((document) => (
                <Row
                  key={document.id}
                  title={document.code}
                  subtitle={formatDate(document.transactionDate)}
                  end={
                    <span className="flex items-center gap-3">
                      <DocumentTypeBadge type={document.type} />
                      <span className="min-w-8">{formatNumber(document.totalQuantity)}</span>
                    </span>
                  }
                />
              ))}
            </ListCard>
          </div>
        </div>
      )}
    </>
  );
}
