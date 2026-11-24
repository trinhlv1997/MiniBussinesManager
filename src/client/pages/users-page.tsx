import { useQuery } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, UserCog } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@shared/format";
import { ROLE_LABELS } from "@shared/permissions";
import type { UserAccount } from "@shared/types";
import { DataTable, type Column } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-auth";
import { ResetPasswordDialog, USERS, UserFormDialog } from "@/features/users/user-dialogs";
import { apiRequest } from "@/lib/api";

type Dialog = { kind: "create" } | { kind: "edit" | "password"; user: UserAccount } | null;

export default function UsersPage() {
  const { data: me } = useSession();
  const [dialog, setDialog] = useState<Dialog>(null);
  const list = useQuery({ queryKey: [USERS.key, "list"], queryFn: () => apiRequest<UserAccount[]>(USERS.path) });

  const columns: Column<UserAccount>[] = [
    {
      key: "name",
      header: "Tài khoản",
      cell: (row) => (
        <div>
          <p className="font-medium">
            {row.displayName}
            {row.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(bạn)</span>}
          </p>
          <p className="text-xs text-muted-foreground">{row.username}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Vai trò",
      cell: (row) => <StatusBadge tone={row.role === "admin" ? "info" : "neutral"}>{ROLE_LABELS[row.role]}</StatusBadge>,
    },
    {
      key: "employee",
      header: "Nhân viên gắn",
      className: "hidden md:table-cell",
      cell: (row) => (row.employeeCode ? `${row.employeeCode} · ${row.employeeName}` : "—"),
    },
    {
      key: "active",
      header: "Trạng thái",
      cell: (row) => <StatusBadge tone={row.active ? "success" : "danger"}>{row.active ? "Đang hoạt động" : "Đã khoá"}</StatusBadge>,
    },
    {
      key: "lastLogin",
      header: "Đăng nhập lần cuối",
      className: "hidden lg:table-cell",
      cell: (row) => formatDateTime(row.lastLoginAt) || "Chưa đăng nhập",
    },
    {
      key: "actions",
      header: "",
      className: "w-px whitespace-nowrap",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "edit", user: row })} aria-label={`Sửa ${row.username}`}>
            <Pencil aria-hidden />
            Sửa
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "password", user: row })} aria-label={`Đặt lại mật khẩu ${row.username}`}>
            <KeyRound aria-hidden />
            Mật khẩu
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Admin có toàn quyền. Nhân viên chỉ dùng Khách hàng, Sản phẩm, Quản lý kho và chỉ thấy khách hàng được phân công hoặc do mình tạo."
        actions={
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus aria-hidden />
            Thêm tài khoản
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.id}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyIcon={UserCog}
        emptyTitle="Chưa có tài khoản"
      />
      {dialog?.kind === "create" && <UserFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <UserFormDialog user={dialog.user} onClose={() => setDialog(null)} />}
      {dialog?.kind === "password" && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
    </>
  );
}
