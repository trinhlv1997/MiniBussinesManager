import { ClipboardList, ListFilter, Plus, X } from "lucide-react";
import { useState } from "react";
import { vnToday } from "@shared/format";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, canManageTasks, isOverdue } from "@shared/tasks";
import type { Task } from "@shared/types";
import { DatePicker } from "@/components/common/date-picker";
import { FilterSelect, SearchInput, optionsFrom } from "@/components/common/list-controls";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-auth";
import { KanbanBoard } from "@/features/tasks/kanban-board";
import { TaskDetailDialog } from "@/features/tasks/task-detail-dialog";
import { TaskFormDialog } from "@/features/tasks/task-form-dialog";
import { taskListKey, useTaskList, useTaskPeople } from "@/features/tasks/use-tasks";
import { useListParams } from "@/hooks/use-list-params";

type Dialog = { kind: "create" } | { kind: "view"; id: number } | { kind: "edit"; task: Task } | null;

/** Số liệu nhanh trên đầu bảng: bấm vào để lọc. */
function Summary({ tasks, onOverdue }: { tasks: Task[]; onOverdue: () => void }) {
  const today = vnToday();
  const overdue = tasks.filter((task) => isOverdue(task, today)).length;
  const review = tasks.filter((task) => task.status === "review").length;
  const cancelAsks = tasks.filter((task) => task.cancelRequestedAt).length;
  const chip = "rounded-full border bg-card px-3 py-1 text-xs";
  return (
    <div className="mb-3 flex flex-wrap gap-2" aria-label="Tóm tắt">
      <span className={chip}>{tasks.length} công việc</span>
      {overdue > 0 && (
        <button type="button" onClick={onOverdue} className={`${chip} border-red-300 bg-red-50 font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300`}>
          {overdue} quá hạn
        </button>
      )}
      {review > 0 && <span className={`${chip} border-amber-300 text-amber-800 dark:text-amber-300`}>{review} chờ duyệt</span>}
      {cancelAsks > 0 && <span className={`${chip} border-red-300 text-red-700 dark:text-red-300`}>{cancelAsks} yêu cầu hủy</span>}
    </div>
  );
}

export default function TasksPage() {
  const { data: me } = useSession();
  const { get, update } = useListParams();
  const { people } = useTaskPeople();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  // Trên điện thoại bộ lọc thu gọn sau nút "Bộ lọc" để bảng Kanban hiện ngay màn hình đầu.
  const [showFilters, setShowFilters] = useState(false);

  const params = {
    search: get("q") || undefined,
    assigneeId: get("assignee") || undefined,
    status: get("status") || undefined,
    priority: get("priority") || undefined,
    from: get("from") || undefined,
    to: get("to") || undefined,
  };
  const list = useTaskList(params);
  const role = me?.role ?? "employee";
  const manages = canManageTasks(role);
  const today = vnToday();
  const tasks = (list.data ?? []).filter((task) => !onlyOverdue || isOverdue(task, today));
  const filtered = Object.values(params).some(Boolean) || onlyOverdue;
  const activeFilters = [params.assigneeId, params.status, params.priority, params.from || params.to].filter(Boolean).length;

  // Nhân viên chỉ thấy việc của mình nên không cần lọc theo người; Quản lý lọc trong người mình giao được.
  const assigneeOptions = people
    .filter((person) => role === "admin" || person.assignable)
    .map((person) => ({ value: String(person.id), label: person.displayName }));

  return (
    <>
      <PageHeader
        title="Công việc"
        description={
          role === "employee"
            ? "Công việc được giao cho bạn. Kéo thẻ sang cột khác hoặc mở thẻ để đổi trạng thái."
            : "Giao việc và theo dõi tiến độ. Kéo thẻ giữa các cột để đổi trạng thái."
        }
        actions={
          manages && (
            <Button onClick={() => setDialog({ kind: "create" })}>
              <Plus aria-hidden />
              Tạo công việc
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="min-w-0 flex-1">
            <SearchInput value={params.search ?? ""} onChange={(value) => update({ q: value })} placeholder="Tìm theo tiêu đề, mô tả" />
          </div>
          <Button variant="outline" className="sm:hidden" aria-expanded={showFilters} onClick={() => setShowFilters((open) => !open)}>
            <ListFilter aria-hidden />
            Bộ lọc
            {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{activeFilters}</span>}
          </Button>
        </div>
        <div className={`${showFilters ? "flex" : "hidden"} w-full flex-col gap-2 sm:contents`}>
        {role !== "employee" && (
          <FilterSelect label="Người nhận" value={get("assignee")} options={assigneeOptions} onChange={(value) => update({ assignee: value })} allLabel="Mọi người nhận" />
        )}
        <FilterSelect label="Trạng thái" value={get("status")} options={optionsFrom(TASK_STATUS_LABELS)} onChange={(value) => update({ status: value })} allLabel="Mọi trạng thái" />
        <FilterSelect label="Độ ưu tiên" value={get("priority")} options={optionsFrom(TASK_PRIORITY_LABELS)} onChange={(value) => update({ priority: value })} allLabel="Mọi độ ưu tiên" />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="flex-1 sm:w-40">
            <DatePicker label="Từ ngày" placeholder="Từ ngày" value={get("from")} onChange={(value) => update({ from: value })} />
          </div>
          <span className="text-muted-foreground">–</span>
          <div className="flex-1 sm:w-40">
            <DatePicker label="Đến ngày" placeholder="Đến ngày" value={get("to")} onChange={(value) => update({ to: value })} />
          </div>
        </div>
        </div>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setOnlyOverdue(false);
              update({ q: undefined, assignee: undefined, status: undefined, priority: undefined, from: undefined, to: undefined });
            }}
          >
            <X aria-hidden />
            Bỏ lọc
          </Button>
        )}
      </div>

      {list.isPending && <PageSkeleton />}
      {list.error && <ErrorState description={list.error.message} onRetry={() => list.refetch()} />}
      {list.data && (
        <>
          <Summary tasks={list.data} onOverdue={() => setOnlyOverdue(true)} />
          {onlyOverdue && <p className="mb-2 text-sm text-red-700 dark:text-red-300">Đang chỉ hiện công việc quá hạn.</p>}
          {list.data.length === 0 && !filtered ? (
            <EmptyState
              icon={ClipboardList}
              title={manages ? "Chưa có công việc nào" : "Bạn chưa được giao công việc nào"}
              description={manages ? "Tạo công việc đầu tiên và giao cho thành viên trong nhóm." : "Công việc được giao sẽ hiện ở đây."}
              action={
                manages && (
                  <Button onClick={() => setDialog({ kind: "create" })}>
                    <Plus aria-hidden />
                    Tạo công việc
                  </Button>
                )
              }
            />
          ) : (
            <KanbanBoard tasks={tasks} role={role} listKey={taskListKey(params)} onOpen={(task) => setDialog({ kind: "view", id: task.id })} />
          )}
          {!params.from && !params.to && !params.status && (
            <p className="mt-2 text-xs text-muted-foreground">Cột Hoàn thành và Đã hủy chỉ hiện công việc kết thúc trong 30 ngày gần nhất. Lọc theo ngày hoặc trạng thái để xem cũ hơn.</p>
          )}
        </>
      )}

      {dialog?.kind === "create" && <TaskFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <TaskFormDialog task={dialog.task} onClose={() => setDialog({ kind: "view", id: dialog.task.id })} />}
      {dialog?.kind === "view" && (
        <TaskDetailDialog taskId={dialog.id} onEdit={(task) => setDialog({ kind: "edit", task })} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
