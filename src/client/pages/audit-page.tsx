import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { AUDIT_ENTITY_LABELS, AUDIT_RETENTION_DAYS, auditActionLabel, auditEntityLabel } from "@shared/audit";
import { formatDateTime } from "@shared/format";
import type { AuditEntry, UserName } from "@shared/types";
import { DataTable, type Column } from "@/components/common/data-table";
import { DatePicker } from "@/components/common/date-picker";
import { ExportButton, FilterSelect, Toolbar, optionsFrom } from "@/components/common/list-controls";
import { PageHeader } from "@/components/common/page-header";
import { USER_NAMES_KEY } from "@/features/users/use-user-names";
import { useListParams } from "@/hooks/use-list-params";
import { apiRequest } from "@/lib/api";
import { toQueryString, useResourceList } from "@/lib/resource";

const columns: Column<AuditEntry>[] = [
  { key: "time", header: "Thời gian", className: "whitespace-nowrap tabular-nums", cell: (row) => formatDateTime(row.createdAt) },
  { key: "actor", header: "Người thực hiện", cell: (row) => row.actorName ?? "—" },
  { key: "action", header: "Thao tác", cell: (row) => auditActionLabel(row.action) },
  { key: "entity", header: "Đối tượng", className: "hidden md:table-cell", cell: (row) => auditEntityLabel(row.entityType) },
  { key: "code", header: "Mã", className: "hidden sm:table-cell font-medium", cell: (row) => row.entityCode ?? row.entityId ?? "—" },
];

export default function AuditPage() {
  const params = useListParams();
  const filters = {
    actorId: params.get("actorId"),
    entityType: params.get("entityType"),
    from: params.get("from"),
    to: params.get("to"),
  };
  const list = useResourceList<AuditEntry>("audit", "/audit-logs", params.values);
  const users = useQuery({ queryKey: USER_NAMES_KEY, queryFn: () => apiRequest<UserName[]>("/user-names") });
  const userOptions = (users.data ?? []).map((user) => ({
    value: String(user.id),
    label: user.active ? user.displayName : `${user.displayName} (đã khoá)`,
  }));

  return (
    <>
      <PageHeader
        title="Nhật ký hoạt động"
        description={`Mọi thao tác thêm, sửa, xoá, nhập / xuất kho, đăng nhập… kèm người thực hiện và thời gian. Chỉ lưu ${AUDIT_RETENTION_DAYS} ngày gần nhất; người tạo / sửa cuối vẫn xem được trong từng bản ghi.`}
        actions={<ExportButton path={`/audit-logs/export${toQueryString(filters)}`} fileName="nhat-ky-hoat-dong" />}
      />
      <Toolbar>
        <FilterSelect
          label="Lọc theo người thực hiện"
          allLabel="Mọi người"
          value={filters.actorId}
          options={userOptions}
          onChange={(actorId) => params.update({ actorId })}
        />
        <FilterSelect
          label="Lọc theo đối tượng"
          allLabel="Mọi đối tượng"
          value={filters.entityType}
          options={optionsFrom(AUDIT_ENTITY_LABELS)}
          onChange={(entityType) => params.update({ entityType })}
        />
        <div className="w-40">
          <DatePicker label="Từ ngày" placeholder="Từ ngày" value={filters.from} onChange={(from) => params.update({ from })} />
        </div>
        <div className="w-40">
          <DatePicker label="Đến ngày" placeholder="Đến ngày" value={filters.to} onChange={(to) => params.update({ to })} />
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
        emptyIcon={History}
        emptyTitle="Chưa có thao tác nào"
      />
    </>
  );
}
