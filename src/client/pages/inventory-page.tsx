import { ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardList, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { formatDate, formatNumber, formatVnd } from "@shared/format";
import {
  STOCK_STATUS_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@shared/labels";
import type { InventoryTransaction, Product } from "@shared/types";
import { DataTable, type Column } from "@/components/common/data-table";
import { DatePicker } from "@/components/common/date-picker";
import {
  ExportButton,
  FilterSelect,
  SearchInput,
  Toolbar,
  optionsFrom,
} from "@/components/common/list-controls";
import { PageHeader } from "@/components/common/page-header";
import { DocumentStatusBadge, DocumentTypeBadge, StockBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentDetailDialog } from "@/features/inventory/document-detail-dialog";
import { DocumentFormDialog, type DocumentKind } from "@/features/inventory/document-form-dialog";
import { categoryOptions, useCategories } from "@/features/products/product-dialogs";
import { useListParams } from "@/hooks/use-list-params";
import { toQueryString, useResourceList } from "@/lib/resource";
import { useUserNames } from "@/features/users/use-user-names";

const stockColumns: Column<Product>[] = [
  {
    key: "sku",
    header: "Mã SKU",
    sortKey: "sku",
    className: "hidden sm:table-cell",
    cell: (row) => <span className="font-medium">{row.sku}</span>,
  },
  {
    key: "name",
    header: "Sản phẩm",
    sortKey: "name",
    cell: (row) => (
      <div className="min-w-28">
        <p>{row.name}</p>
        <p className="text-xs text-muted-foreground">
          <span className="sm:hidden">{row.sku} · </span>
          {row.categoryName}
        </p>
      </div>
    ),
  },
  {
    key: "quantity",
    header: "Tồn kho",
    sortKey: "quantity",
    className: "text-right",
    cell: (row) => (
      <div className="space-y-1">
        <p className="tabular-nums whitespace-nowrap">{formatNumber(row.quantity)} {row.unit}</p>
        <div className="sm:hidden"><StockBadge status={row.stockStatus} /></div>
      </div>
    ),
  },
  {
    key: "min",
    header: "Tối thiểu",
    className: "hidden text-right md:table-cell",
    cell: (row) => <span className="tabular-nums">{formatNumber(row.minStock)}</span>,
  },
  {
    key: "value",
    header: "Giá trị tồn",
    className: "hidden text-right lg:table-cell",
    cell: (row) => <span className="tabular-nums">{formatVnd(row.quantity * row.costPrice)}</span>,
  },
  { key: "stock", header: "Tình trạng", className: "hidden sm:table-cell", cell: (row) => <StockBadge status={row.stockStatus} /> },
];

function StockTab() {
  const params = useListParams();
  const categories = useCategories();
  const list = useResourceList<Product>("inventory", "/inventory/balances", params.values);
  return (
    <>
      <Toolbar>
        <SearchInput
          placeholder="Tìm theo tên hoặc mã SKU"
          value={params.get("search")}
          onChange={(search) => params.update({ search })}
        />
        <FilterSelect
          label="Lọc theo danh mục"
          allLabel="Tất cả danh mục"
          value={params.get("categoryId")}
          options={categoryOptions(categories.data)}
          onChange={(categoryId) => params.update({ categoryId })}
        />
        <FilterSelect
          label="Lọc theo tình trạng tồn kho"
          allLabel="Mọi tình trạng tồn"
          value={params.get("stockStatus")}
          options={optionsFrom(STOCK_STATUS_LABELS)}
          onChange={(stockStatus) => params.update({ stockStatus })}
        />
      </Toolbar>
      <DataTable
        columns={stockColumns}
        rows={list.data?.items}
        rowKey={(row) => row.id}
        pagination={list.data?.pagination}
        params={params}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyIcon={Boxes}
      />
    </>
  );
}

function AlertList({ status, title }: { status: "low_stock" | "out_of_stock"; title: string }) {
  const list = useResourceList<Product>("inventory", "/inventory/balances", {
    stockStatus: status,
    status: "active",
    pageSize: 50,
    sort: "quantity",
    dir: "asc",
  });
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">
        {title} {list.data && `(${list.data.pagination.total})`}
      </h2>
      <DataTable
        columns={stockColumns}
        rows={list.data?.items}
        rowKey={(row) => row.id}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyIcon={TriangleAlert}
        emptyTitle="Không có cảnh báo"
        emptyDescription="Không có sản phẩm nào ở tình trạng này."
      />
    </section>
  );
}

function HistoryTab() {
  const params = useListParams();
  const [openId, setOpenId] = useState<number | null>(null);
  const list = useResourceList<InventoryTransaction>("inventory", "/inventory/transactions", params.values);
  const nameOf = useUserNames();
  const filters = {
    search: params.get("search"),
    type: params.get("type"),
    status: params.get("status"),
    from: params.get("from"),
    to: params.get("to"),
  };
  const columns: Column<InventoryTransaction>[] = [
    { key: "code", header: "Mã phiếu", cell: (row) => <span className="font-medium">{row.code}</span> },
    { key: "date", header: "Ngày", cell: (row) => formatDate(row.transactionDate) },
    { key: "type", header: "Loại", cell: (row) => <DocumentTypeBadge type={row.type} /> },
    { key: "status", header: "Trạng thái", cell: (row) => <DocumentStatusBadge status={row.status} /> },
    {
      key: "quantity",
      header: "Số lượng",
      className: "hidden text-right md:table-cell",
      cell: (row) => <span className="tabular-nums">{formatNumber(row.totalQuantity)}</span>,
    },
    {
      key: "amount",
      header: "Thành tiền",
      className: "hidden text-right lg:table-cell",
      cell: (row) => <span className="tabular-nums">{row.totalAmount ? formatVnd(row.totalAmount) : "—"}</span>,
    },
    {
      key: "recipient",
      header: "Người nhận / tham chiếu",
      className: "hidden lg:table-cell",
      cell: (row) => row.recipientName ?? row.reference ?? row.reason ?? "—",
    },
    {
      key: "createdBy",
      header: "Người lập",
      className: "hidden xl:table-cell",
      cell: (row) => nameOf(row.createdBy) ?? "—",
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput
          placeholder="Tìm mã phiếu, người nhận"
          value={filters.search}
          onChange={(search) => params.update({ search })}
        />
        <FilterSelect
          label="Lọc theo loại phiếu"
          allLabel="Tất cả loại phiếu"
          value={filters.type}
          options={optionsFrom(TRANSACTION_TYPE_LABELS)}
          onChange={(type) => params.update({ type })}
        />
        <FilterSelect
          label="Lọc theo trạng thái"
          allLabel="Tất cả trạng thái"
          value={filters.status}
          options={optionsFrom(TRANSACTION_STATUS_LABELS)}
          onChange={(status) => params.update({ status })}
        />
        <div className="w-40">
          <DatePicker label="Từ ngày" placeholder="Từ ngày" value={filters.from} onChange={(from) => params.update({ from })} />
        </div>
        <div className="w-40">
          <DatePicker label="Đến ngày" placeholder="Đến ngày" value={filters.to} onChange={(to) => params.update({ to })} />
        </div>
        <ExportButton path={`/inventory/transactions/export${toQueryString(filters)}`} fileName="phieu-kho" />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={list.data?.items}
        rowKey={(row) => row.id}
        pagination={list.data?.pagination}
        params={params}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        onRowClick={(row) => setOpenId(row.id)}
        emptyIcon={ClipboardList}
        emptyTitle="Chưa có phiếu kho phù hợp"
      />
      {openId && <DocumentDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

export default function InventoryPage() {
  const params = useListParams();
  const [creating, setCreating] = useState<DocumentKind | null>(null);
  const tab = params.get("tab") || "stock";

  return (
    <>
      <PageHeader
        title="Quản lý kho"
        description="Nhập kho, xuất kho, điều chỉnh và theo dõi tồn kho."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCreating("adjust")}>
              <SlidersHorizontal aria-hidden />
              Điều chỉnh
            </Button>
            <Button variant="outline" onClick={() => setCreating("export")}>
              <ArrowUpFromLine aria-hidden />
              Xuất kho
            </Button>
            <Button onClick={() => setCreating("import")}>
              <ArrowDownToLine aria-hidden />
              Nhập kho
            </Button>
          </div>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          params.update({
            tab: next,
            search: undefined,
            sort: undefined,
            dir: undefined,
            type: undefined,
            status: undefined,
            from: undefined,
            to: undefined,
            categoryId: undefined,
            stockStatus: undefined,
          })
        }
      >
        <TabsList className="mb-4">
          <TabsTrigger value="stock">Tồn kho</TabsTrigger>
          <TabsTrigger value="history">Lịch sử giao dịch</TabsTrigger>
          <TabsTrigger value="alerts">Cảnh báo</TabsTrigger>
        </TabsList>
        <TabsContent value="stock"><StockTab /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
        <TabsContent value="alerts" className="space-y-6">
          <AlertList status="out_of_stock" title="Hết hàng" />
          <AlertList status="low_stock" title="Sắp hết hàng" />
        </TabsContent>
      </Tabs>
      {creating && <DocumentFormDialog kind={creating} onClose={() => setCreating(null)} />}
    </>
  );
}
