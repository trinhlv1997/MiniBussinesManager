import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import type { Team, TeamCandidate } from "@shared/types";
import { ConfirmDialog } from "@/components/common/dialogs";
import { DataTable, type Column } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-auth";
import { TEAMS, TeamDialog, TeamMembersDialog } from "@/features/teams/team-dialog";
import { apiRequest } from "@/lib/api";
import { useDeleteResource } from "@/lib/resource";

type Dialog = { kind: "form"; team?: Team } | { kind: "members"; team: Team } | { kind: "delete"; team: Team } | null;

/**
 * Quản trị: tạo / sửa / xoá mọi nhóm. Quản lý: chỉ thấy nhóm mình và thêm / bớt thành viên
 * (server chặn các thao tác còn lại, giao diện chỉ ẩn nút).
 */
export default function TeamsPage() {
  const { data: me } = useSession();
  const isAdmin = me?.role === "admin";
  const [dialog, setDialog] = useState<Dialog>(null);
  const teams = useQuery({ queryKey: [TEAMS.key, "list"], queryFn: () => apiRequest<Team[]>(TEAMS.path) });
  const candidates = useQuery({ queryKey: [TEAMS.key, "candidates"], queryFn: () => apiRequest<TeamCandidate[]>(`${TEAMS.path}/candidates`) });
  const remove = useDeleteResource(TEAMS.key, TEAMS.path, ["tasks"]);
  const nameOf = (id: number | null) => candidates.data?.find((c) => c.userId === id)?.name ?? "—";

  const columns: Column<Team>[] = [
    {
      key: "name",
      header: "Nhóm",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
        </div>
      ),
    },
    { key: "manager", header: "Trưởng nhóm", cell: (row) => nameOf(row.managerId) },
    {
      key: "members",
      header: "Thành viên",
      cell: (row) => (
        <span className="text-sm">
          <span className="font-medium tabular-nums">{row.memberIds.length}</span>
          <span className="hidden text-muted-foreground md:inline">{row.memberIds.length > 0 && ` · ${row.memberIds.map(nameOf).join(", ")}`}</span>
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-px whitespace-nowrap",
      cell: (row) =>
        isAdmin ? (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "form", team: row })} aria-label={`Sửa ${row.name}`}>
              <Pencil aria-hidden />
              Sửa
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDialog({ kind: "delete", team: row })} aria-label={`Xoá ${row.name}`}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "members", team: row })} aria-label={`Thành viên ${row.name}`}>
            <UserPlus aria-hidden />
            Thành viên
          </Button>
        ),
    },
  ];

  const add = isAdmin && (
    <Button onClick={() => setDialog({ kind: "form" })}>
      <Plus aria-hidden />
      Tạo nhóm
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Nhóm"
        description={
          isAdmin
            ? "Mỗi nhóm có một trưởng nhóm. Trưởng nhóm thấy và giao việc cho thành viên nhóm mình."
            : "Nhóm bạn làm trưởng nhóm. Thêm hoặc bớt thành viên để giao việc cho họ."
        }
        actions={add}
      />
      {(teams.isPending || candidates.isPending) && <PageSkeleton />}
      {teams.error && <ErrorState description={teams.error.message} onRetry={() => teams.refetch()} />}
      {teams.data &&
        candidates.data &&
        (teams.data.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={isAdmin ? "Chưa có nhóm nào" : "Bạn chưa làm trưởng nhóm nào"}
            description={isAdmin ? "Tạo nhóm, chọn trưởng nhóm và thành viên để giao việc theo nhóm." : "Nhờ Quản trị viên chọn bạn làm trưởng nhóm."}
            action={add || undefined}
          />
        ) : (
          <DataTable columns={columns} rows={teams.data} rowKey={(row) => row.id} isLoading={false} />
        ))}
      {dialog?.kind === "form" && teams.data && candidates.data && (
        <TeamDialog team={dialog.team} teams={teams.data} candidates={candidates.data} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "members" && teams.data && candidates.data && (
        <TeamMembersDialog team={dialog.team} teams={teams.data} candidates={candidates.data} onClose={() => setDialog(null)} />
      )}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={`Xoá nhóm "${dialog?.kind === "delete" ? dialog.team.name : ""}"?`}
        description="Thành viên chỉ được gỡ khỏi nhóm; công việc đã giao vẫn giữ nguyên."
        successMessage="Đã xoá nhóm"
        onConfirm={() => (dialog?.kind === "delete" ? remove.mutateAsync(dialog.team.id) : Promise.resolve())}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
