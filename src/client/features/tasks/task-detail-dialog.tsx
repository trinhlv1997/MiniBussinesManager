import { Ban, History, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatDate, formatDateTime, vnToday } from "@shared/format";
import type { Role } from "@shared/permissions";
import {
  TASK_HISTORY_FIELDS,
  TASK_STATUS_LABELS,
  allowedTransitions,
  canDeleteTasks,
  canManageTasks,
  isFinalStatus,
  isOverdue,
  type TaskStatus,
} from "@shared/tasks";
import type { TaskDetail, TaskHistoryEntry } from "@shared/types";
import { AppDialog, ConfirmDialog, DetailGrid } from "@/components/common/dialogs";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/use-auth";
import { StatusChangeDialog } from "./status-change-dialog";
import { DueDate, OverdueBadge, PersonAvatar, PriorityBadge, STATUS_COLORS, TaskStatusBadge } from "./task-ui";
import { useCancelRequest, useChangeStatus, useDeleteTask, useRejectCancel, useTaskDetail, useTaskPeople } from "./use-tasks";

/** Nhãn nút chuyển trạng thái, theo trạng thái đích (và trạng thái hiện tại khi "mở lại" / "trả về"). */
function transitionLabel(from: TaskStatus, to: TaskStatus) {
  if (to === "open") return from === "in_progress" ? "Trả về Mới" : "Mở lại";
  if (to === "in_progress") return from === "review" ? "Yêu cầu làm lại" : "Bắt đầu làm";
  if (to === "review") return "Gửi duyệt";
  if (to === "done") return from === "review" ? "Duyệt hoàn thành" : "Hoàn thành";
  return "Hủy công việc";
}

function HistoryLine({ entry, nameOf }: { entry: TaskHistoryEntry; nameOf: (id: number | null) => string }) {
  const show = (value: string | null) => {
    if (value === null || value === "") return "trống";
    if (entry.field === "status") return TASK_STATUS_LABELS[value as TaskStatus] ?? value;
    if (entry.field === "assignee") return nameOf(Number(value));
    if (entry.field === "start_date" || entry.field === "due_date") return formatDate(value);
    if (entry.field === "description") return value.length > 60 ? `${value.slice(0, 60)}…` : value;
    return value;
  };
  let text: string;
  if (entry.field === "created") text = "tạo công việc";
  else if (entry.field === "cancel_request") text = `yêu cầu hủy: ${entry.newValue}`;
  else text = `${TASK_HISTORY_FIELDS[entry.field] ?? entry.field}: ${show(entry.oldValue)} → ${show(entry.newValue)}`;
  return (
    <li className="flex gap-2 text-sm">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
      <span>
        <span className="font-medium">{nameOf(entry.actorId)}</span> {text}
        {entry.note && (
          <span className="mt-1 block rounded-md border-l-2 border-primary/40 bg-muted/60 px-2 py-1 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
            Lý do: {entry.note}
          </span>
        )}
        <span className="block text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
      </span>
    </li>
  );
}

function CancelRequestForm({ taskId, onDone }: { taskId: number; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const request = useCancelRequest();
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <label htmlFor="cancel-reason" className="text-sm font-medium">
        Lý do muốn hủy
      </label>
      <Textarea id="cancel-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Thôi
        </Button>
        <Button
          size="sm"
          disabled={!reason.trim() || request.isPending}
          onClick={() =>
            request.mutate(
              { id: taskId, reason: reason.trim() },
              {
                onSuccess: () => {
                  toast.success("Đã gửi yêu cầu hủy cho Quản lý");
                  onDone();
                },
                onError: (error) => toast.error(error.message),
              },
            )
          }
        >
          Gửi yêu cầu
        </Button>
      </div>
    </div>
  );
}

function TaskActions({ task, role, meId, onEdit, onClose }: { task: TaskDetail; role: Role; meId: number; onEdit: () => void; onClose: () => void }) {
  const changeStatus = useChangeStatus();
  const rejectCancel = useRejectCancel();
  const deleteTask = useDeleteTask();
  const [asking, setAsking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveTo, setMoveTo] = useState<TaskStatus | null>(null);
  const transitions = allowedTransitions(role, task);
  const canRequestCancel = role === "employee" && task.assigneeId === meId && !isFinalStatus(task.status) && !task.cancelRequestedAt;

  // Bấm nút trạng thái → hỏi lý do (không bắt buộc) → đổi trạng thái.
  const move = (to: TaskStatus) => setMoveTo(to);
  const applyMove = (to: TaskStatus, note: string | null) =>
    changeStatus.mutate(
      { id: task.id, status: to, from: task.status, note },
      {
        onSuccess: () => {
          setMoveTo(null);
          toast.success(`Đã chuyển sang ${TASK_STATUS_LABELS[to]}`);
        },
        onError: (error) => toast.error(error.message),
      },
    );

  return (
    <div className="space-y-3">
      {task.cancelRequestedAt && (
        <Alert variant="destructive">
          <Ban aria-hidden />
          <AlertTitle>Nhân viên đã gửi yêu cầu hủy</AlertTitle>
          <AlertDescription>
            <p>{task.cancelRequestReason}</p>
            {canManageTasks(role) && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" disabled={changeStatus.isPending} onClick={() => move("cancelled")}>
                  Đồng ý hủy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rejectCancel.isPending}
                  onClick={() =>
                    rejectCancel.mutate(task.id, {
                      onSuccess: () => toast.success("Đã từ chối, công việc tiếp tục"),
                      onError: (error) => toast.error(error.message),
                    })
                  }
                >
                  Từ chối, tiếp tục làm
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {transitions.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={to === "cancelled" ? "outline" : to === "done" ? "default" : "secondary"}
            className={to === "cancelled" ? "text-destructive" : undefined}
            disabled={changeStatus.isPending}
            onClick={() => move(to)}
          >
            <span className={`size-2 rounded-full ${STATUS_COLORS[to].dot}`} aria-hidden />
            {transitionLabel(task.status, to)}
          </Button>
        ))}
        {canRequestCancel && !asking && (
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
            <Ban aria-hidden />
            Yêu cầu hủy
          </Button>
        )}
        <span className="grow" />
        {canManageTasks(role) && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil aria-hidden />
            Sửa
          </Button>
        )}
        {canDeleteTasks(role) && (
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden />
            Xoá
          </Button>
        )}
      </div>
      {transitions.length === 0 && !canManageTasks(role) && !isFinalStatus(task.status) && (
        <p className="text-sm text-muted-foreground">Đang chờ Quản lý duyệt.</p>
      )}
      {asking && <CancelRequestForm taskId={task.id} onDone={() => setAsking(false)} />}
      {moveTo && (
        <StatusChangeDialog
          title={task.title}
          from={task.status}
          to={moveTo}
          pending={changeStatus.isPending}
          onConfirm={(note) => applyMove(moveTo, note)}
          onClose={() => setMoveTo(null)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Xoá công việc?"
        description="Công việc và toàn bộ lịch sử thay đổi sẽ bị xoá vĩnh viễn. Nếu chỉ không làm nữa, hãy chuyển sang Đã hủy."
        successMessage="Đã xoá công việc"
        onConfirm={() => deleteTask.mutateAsync(task.id).then(onClose)}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export function TaskDetailDialog({ taskId, onEdit, onClose }: { taskId: number; onEdit: (task: TaskDetail) => void; onClose: () => void }) {
  const detail = useTaskDetail(taskId);
  const { data: me } = useSession();
  const { personOf } = useTaskPeople();
  const task = detail.data;
  const nameOf = (id: number | null) => personOf(id)?.displayName ?? "Không rõ";

  return (
    <AppDialog open onClose={onClose} title={task?.title ?? "Công việc"} size="lg">
      {detail.isPending && <PageSkeleton />}
      {detail.error && <ErrorState description={detail.error.message} onRetry={() => detail.refetch()} />}
      {task && me && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {isOverdue(task, vnToday()) && <OverdueBadge />}
            {task.requiresReview && <span className="text-xs text-muted-foreground">· Cần duyệt</span>}
          </div>
          <TaskActions task={task} role={me.role} meId={me.id} onEdit={() => onEdit(task)} onClose={onClose} />
          <DetailGrid
            items={[
              [
                "Người nhận",
                <span key="a" className="inline-flex items-center gap-2">
                  <PersonAvatar person={personOf(task.assigneeId)} />
                  {nameOf(task.assigneeId)}
                </span>,
              ],
              ["Người giao", nameOf(task.assignerId)],
              ["Ngày bắt đầu", formatDate(task.startDate)],
              ["Hạn chót", <DueDate key="d" dueDate={task.dueDate} overdue={isOverdue(task, vnToday())} />],
              ...(task.completedAt ? ([["Hoàn thành lúc", formatDateTime(task.completedAt)]] as [string, string][]) : []),
            ]}
          />
          {task.description && (
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">Mô tả</h3>
              <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{task.description}</p>
            </div>
          )}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <History className="size-4" aria-hidden />
              Lịch sử thay đổi
            </h3>
            <ol className="space-y-2.5">
              {[...task.history].reverse().map((entry) => (
                <HistoryLine key={entry.id} entry={entry} nameOf={nameOf} />
              ))}
            </ol>
          </div>
        </div>
      )}
    </AppDialog>
  );
}
