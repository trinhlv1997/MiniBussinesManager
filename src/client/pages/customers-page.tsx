import { Plus, UserRound } from "lucide-react";
import { formatDate } from "@shared/format";
import { CUSTOMER_TIER_LABELS, CUSTOMER_TYPE_LABELS } from "@shared/labels";
import type { Customer } from "@shared/types";
import { DataTable, type Column } from "@/components/common/data-table";
import { DatePicker } from "@/components/common/date-picker";
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
import { CustomerTierBadge, CustomerTypeBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import {
  CUSTOMERS,
  CustomerDetailDialog,
  CustomerFormDialog,
} from "@/features/customers/customer-dialogs";
import { useCan } from "@/features/auth/use-auth";
import { useEmployeeOptions } from "@/features/employees/use-employee-options";
import { useEntityDialog } from "@/hooks/use-entity-dialog";
import { useListParams } from "@/hooks/use-list-params";
import { toQueryString, useDeleteResource, useResourceList } from "@/lib/resource";

/** Chỉ Admin (có quyền xem danh sách nhân viên) mới lọc theo người chăm sóc. */
function CareEmployeeFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { options } = useEmployeeOptions();
  return (
    <FilterSelect
      label="Lọc theo nhân viên chăm sóc"
      allLabel="Mọi nhân viên chăm sóc"
      value={value}
      options={options}
      onChange={onChange}
    />
  );
}

export default function CustomersPage() {
  const can = useCan();
  const params = useListParams();
  const dialog = useEntityDialog<Customer>();
  const list = useResourceList<Customer>(CUSTOMERS.key, CUSTOMERS.path, params.values);
  const remove = useDeleteResource(CUSTOMERS.key, CUSTOMERS.path);

  const columns: Column<Customer>[] = [
    { key: "code", header: "Mã", sortKey: "code", cell: (row) => <span className="font-medium">{row.code}</span> },
    { key: "name", header: "Tên khách hàng", sortKey: "name", cell: (row) => row.name },
    { key: "type", header: "Loại", sortKey: "type", cell: (row) => <CustomerTypeBadge type={row.type} /> },
    // Sắp xếp giảm dần theo hạng đưa khách VIP lên đầu ('vip' > 'normal').
    { key: "tier", header: "Hạng", sortKey: "tier", cell: (row) => <CustomerTierBadge tier={row.tier} /> },
    { key: "contact", header: "Người liên hệ", className: "hidden lg:table-cell", cell: (row) => row.contactName ?? "—" },
    { key: "phone", header: "Số điện thoại", className: "hidden md:table-cell", cell: (row) => row.phone ?? "—" },
    {
      key: "address",
      header: "Địa chỉ",
      className: "hidden xl:table-cell max-w-56",
      cell: (row) => (
        <span className="line-clamp-2 whitespace-normal" title={row.address ?? undefined}>
          {row.address ?? "—"}
        </span>
      ),
    },
    {
      key: "careEmployee",
      header: "NV chăm sóc",
      className: "hidden lg:table-cell",
      cell: (row) => row.careEmployeeName ?? <span className="text-muted-foreground">Chưa phân công</span>,
    },
    {
      key: "note",
      header: "Ghi chú",
      className: "hidden xl:table-cell max-w-48",
      cell: (row) => (
        <span className="line-clamp-2 whitespace-normal text-muted-foreground" title={row.note ?? undefined}>
          {row.note ?? "—"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Ngày tạo",
      sortKey: "createdAt",
      className: "hidden 2xl:table-cell",
      cell: (row) => formatDate(row.createdAt),
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
    type: params.get("type"),
    tier: params.get("tier"),
    careEmployeeId: params.get("careEmployeeId"),
    createdFrom: params.get("createdFrom"),
    createdTo: params.get("createdTo"),
  };

  return (
    <>
      <PageHeader
        title="Khách hàng"
        description="Quản lý thông tin và ghi chú khách hàng."
        actions={
          <div className="flex gap-2">
            <ExportButton path={`/customers/export${toQueryString(filters)}`} fileName="khach-hang" />
            <Button onClick={dialog.create}>
              <Plus aria-hidden />
              Thêm mới
            </Button>
          </div>
        }
      />
      <Toolbar>
        <SearchInput
          placeholder="Tìm theo tên, mã, SĐT, địa chỉ"
          value={filters.search}
          onChange={(search) => params.update({ search })}
        />
        <FilterSelect
          label="Lọc theo loại khách hàng"
          allLabel="Tất cả loại"
          value={filters.type}
          options={optionsFrom(CUSTOMER_TYPE_LABELS)}
          onChange={(type) => params.update({ type })}
        />
        <FilterSelect
          label="Lọc theo hạng khách hàng"
          allLabel="Tất cả hạng"
          value={filters.tier}
          options={optionsFrom(CUSTOMER_TIER_LABELS)}
          onChange={(tier) => params.update({ tier })}
        />
        {can("employees") && (
          <CareEmployeeFilter value={filters.careEmployeeId} onChange={(careEmployeeId) => params.update({ careEmployeeId })} />
        )}
        <div className="w-40">
          <DatePicker
            label="Tạo từ ngày"
            placeholder="Tạo từ ngày"
            value={filters.createdFrom}
            onChange={(createdFrom) => params.update({ createdFrom })}
          />
        </div>
        <div className="w-40">
          <DatePicker
            label="Tạo đến ngày"
            placeholder="Đến ngày"
            value={filters.createdTo}
            onChange={(createdTo) => params.update({ createdTo })}
          />
        </div>
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
        emptyIcon={UserRound}
        emptyTitle="Chưa có khách hàng phù hợp"
      />

      {dialog.mode === "create" && <CustomerFormDialog onClose={dialog.close} />}
      {dialog.mode === "edit" && <CustomerFormDialog customer={dialog.row} onClose={dialog.close} />}
      {dialog.mode === "view" && dialog.row && (
        <CustomerDetailDialog id={dialog.row.id} onClose={dialog.close} />
      )}
      {dialog.mode === "delete" && dialog.row && (
        <ConfirmDialog
          open
          title="Xóa khách hàng?"
          description={`${dialog.row.name} sẽ bị xóa khỏi danh sách.`}
          successMessage="Đã xóa khách hàng"
          onConfirm={() => remove.mutateAsync(dialog.row!.id)}
          onClose={dialog.close}
        />
      )}
    </>
  );
}
