import { Plus, Users } from "lucide-react";
import { formatDate } from "@shared/format";
import { EMPLOYEE_STATUS_LABELS } from "@shared/labels";
import type { Employee } from "@shared/types";
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
import { EmployeeStatusBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import {
  EMPLOYEES,
  EmployeeDetailDialog,
  EmployeeFormDialog,
} from "@/features/employees/employee-dialogs";
import { useEntityDialog } from "@/hooks/use-entity-dialog";
import { useListParams } from "@/hooks/use-list-params";
import { toQueryString, useDeleteResource, useResourceList } from "@/lib/resource";

export default function EmployeesPage() {
  const params = useListParams();
  const dialog = useEntityDialog<Employee>();
  const list = useResourceList<Employee>(EMPLOYEES.key, EMPLOYEES.path, params.values);
  const remove = useDeleteResource(EMPLOYEES.key, EMPLOYEES.path);

  const columns: Column<Employee>[] = [
    { key: "code", header: "Mã", sortKey: "code", cell: (row) => <span className="font-medium">{row.code}</span> },
    { key: "fullName", header: "Họ và tên", sortKey: "fullName", cell: (row) => row.fullName },
    { key: "phone", header: "Số điện thoại", className: "hidden md:table-cell", cell: (row) => row.phone ?? "—" },
    { key: "position", header: "Chức vụ", className: "hidden lg:table-cell", cell: (row) => row.position ?? "—" },
    {
      key: "hireDate",
      header: "Ngày vào làm",
      sortKey: "hireDate",
      className: "hidden lg:table-cell",
      cell: (row) => formatDate(row.hireDate) || "—",
    },
    { key: "status", header: "Trạng thái", sortKey: "status", cell: (row) => <EmployeeStatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (row) => (
        <RowActions
          label={row.fullName}
          onView={() => dialog.view(row)}
          onEdit={() => dialog.edit(row)}
          onDelete={() => dialog.remove(row)}
        />
      ),
    },
  ];

  const filters = { search: params.get("search"), status: params.get("status") };

  return (
    <>
      <PageHeader
        title="Nhân viên"
        description="Quản lý hồ sơ và trạng thái làm việc của nhân viên."
        actions={
          <div className="flex gap-2">
            <ExportButton path={`/employees/export${toQueryString(filters)}`} fileName="nhan-vien" />
            <Button onClick={dialog.create}>
              <Plus aria-hidden />
              Thêm mới
            </Button>
          </div>
        }
      />
      <Toolbar>
        <SearchInput
          placeholder="Tìm theo tên, mã, số điện thoại"
          value={filters.search}
          onChange={(search) => params.update({ search })}
        />
        <FilterSelect
          label="Lọc theo trạng thái"
          allLabel="Tất cả trạng thái"
          value={filters.status}
          options={optionsFrom(EMPLOYEE_STATUS_LABELS)}
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
        emptyIcon={Users}
        emptyTitle="Chưa có nhân viên phù hợp"
      />

      {dialog.mode === "create" && <EmployeeFormDialog onClose={dialog.close} />}
      {dialog.mode === "edit" && <EmployeeFormDialog id={dialog.row?.id} onClose={dialog.close} />}
      {dialog.mode === "view" && dialog.row && (
        <EmployeeDetailDialog id={dialog.row.id} onClose={dialog.close} />
      )}
      {dialog.mode === "delete" && dialog.row && (
        <ConfirmDialog
          open
          title="Xóa nhân viên?"
          description={`Hồ sơ của ${dialog.row.fullName} sẽ bị xóa khỏi danh sách.`}
          successMessage="Đã xóa nhân viên"
          onConfirm={() => remove.mutateAsync(dialog.row!.id)}
          onClose={dialog.close}
        />
      )}
    </>
  );
}
