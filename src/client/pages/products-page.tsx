import { FolderTree, Package, Plus } from "lucide-react";
import { useState } from "react";
import { formatNumber, formatVnd } from "@shared/format";
import { PRODUCT_STATUS_LABELS, STOCK_STATUS_LABELS } from "@shared/labels";
import type { Product } from "@shared/types";
import { DataTable, type Column } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/dialogs";
import {
  ExportButton,
  FilterSelect,
  RowActions,
  SearchInput,
  Toolbar,
  optionsFrom,
} from "@/components/common/list-controls";
import { PageHeader } from "@/components/common/page-header";
import { ProductStatusBadge, StockBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { CategoryDialog } from "@/features/products/category-dialog";
import {
  CATEGORIES,
  PRODUCTS,
  ProductDetailDialog,
  ProductFormDialog,
  categoryOptions,
  useCategories,
} from "@/features/products/product-dialogs";
import { useEntityDialog } from "@/hooks/use-entity-dialog";
import { useListParams } from "@/hooks/use-list-params";
import { toQueryString, useDeleteResource, useResourceList } from "@/lib/resource";

export default function ProductsPage() {
  const params = useListParams();
  const dialog = useEntityDialog<Product>();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categories = useCategories();
  const list = useResourceList<Product>(PRODUCTS.key, PRODUCTS.path, params.values);
  const remove = useDeleteResource(PRODUCTS.key, PRODUCTS.path, ["inventory", CATEGORIES.key]);

  const columns: Column<Product>[] = [
    { key: "sku", header: "Mã SKU", sortKey: "sku", className: "hidden sm:table-cell", cell: (row) => <span className="font-medium">{row.sku}</span> },
    {
      key: "name",
      header: "Sản phẩm",
      sortKey: "name",
      cell: (row) => (
        <div className="min-w-28">
          <p>{row.name}</p>
          <p className="text-xs text-muted-foreground">
            <span className="sm:hidden">{row.sku} · </span>
            {row.brand && `${row.brand} · `}
            {row.categoryName}
          </p>
        </div>
      ),
    },
    {
      key: "warranty",
      header: "Bảo hành",
      className: "hidden whitespace-nowrap xl:table-cell",
      cell: (row) => (row.warrantyMonths > 0 ? `${row.warrantyMonths} tháng` : "—"),
    },
    {
      key: "costPrice",
      header: "Giá nhập",
      sortKey: "costPrice",
      className: "hidden text-right lg:table-cell",
      cell: (row) => <span className="tabular-nums">{formatVnd(row.costPrice)}</span>,
    },
    {
      key: "salePrice",
      header: "Giá bán",
      sortKey: "salePrice",
      className: "hidden text-right md:table-cell",
      cell: (row) => <span className="tabular-nums">{formatVnd(row.salePrice)}</span>,
    },
    {
      key: "quantity",
      header: "Tồn kho",
      sortKey: "quantity",
      className: "text-right",
      cell: (row) => (
        <div className="space-y-1">
          <p className="tabular-nums whitespace-nowrap">
            {formatNumber(row.quantity)} {row.unit}
          </p>
          <div className="sm:hidden">
            <StockBadge status={row.stockStatus} />
          </div>
        </div>
      ),
    },
    { key: "stock", header: "Tình trạng", className: "hidden sm:table-cell", cell: (row) => <StockBadge status={row.stockStatus} /> },
    {
      key: "status",
      header: "Trạng thái",
      className: "hidden xl:table-cell",
      cell: (row) => <ProductStatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (row) => (
        <RowActions
          label={row.name}
          onView={() => dialog.view(row)}
          onEdit={() => dialog.edit(row)}
          onDelete={() => dialog.remove(row)}
        />
      ),
    },
  ];

  const filters = {
    search: params.get("search"),
    categoryId: params.get("categoryId"),
    stockStatus: params.get("stockStatus"),
    status: params.get("status"),
  };

  return (
    <>
      <PageHeader
        title="Sản phẩm"
        description="Quản lý thiết bị điện, đồ điện tử, thương hiệu, bảo hành và giá bán."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <FolderTree aria-hidden />
              Danh mục
            </Button>
            <ExportButton path={`/products/export${toQueryString(filters)}`} fileName="san-pham" />
            <Button onClick={dialog.create}>
              <Plus aria-hidden />
              Thêm mới
            </Button>
          </div>
        }
      />
      <Toolbar>
        <SearchInput
          placeholder="Tìm tên, SKU, thương hiệu"
          value={filters.search}
          onChange={(search) => params.update({ search })}
        />
        <FilterSelect
          label="Lọc theo danh mục"
          allLabel="Tất cả danh mục"
          value={filters.categoryId}
          options={categoryOptions(categories.data)}
          onChange={(categoryId) => params.update({ categoryId })}
        />
        <FilterSelect
          label="Lọc theo tình trạng tồn kho"
          allLabel="Mọi tình trạng tồn"
          value={filters.stockStatus}
          options={optionsFrom(STOCK_STATUS_LABELS)}
          onChange={(stockStatus) => params.update({ stockStatus })}
        />
        <FilterSelect
          label="Lọc theo trạng thái"
          allLabel="Tất cả trạng thái"
          value={filters.status}
          options={optionsFrom(PRODUCT_STATUS_LABELS)}
          onChange={(status) => params.update({ status })}
        />
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
        onRowClick={dialog.view}
        emptyIcon={Package}
        emptyTitle="Chưa có sản phẩm phù hợp"
      />

      {categoriesOpen && <CategoryDialog onClose={() => setCategoriesOpen(false)} />}
      {dialog.mode === "create" && <ProductFormDialog onClose={dialog.close} />}
      {dialog.mode === "edit" && <ProductFormDialog id={dialog.row?.id} onClose={dialog.close} />}
      {dialog.mode === "view" && dialog.row && (
        <ProductDetailDialog id={dialog.row.id} onClose={dialog.close} />
      )}
      {dialog.mode === "delete" && dialog.row && (
        <ConfirmDialog
          open
          title="Xóa sản phẩm?"
          description={`${dialog.row.name} sẽ bị xóa. Sản phẩm đã có giao dịch kho thì không xóa được.`}
          successMessage="Đã xóa sản phẩm"
          onConfirm={() => remove.mutateAsync(dialog.row!.id)}
          onClose={dialog.close}
        />
      )}
    </>
  );
}
