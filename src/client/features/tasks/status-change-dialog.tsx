import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { TASK_STATUS_LABELS, type TaskStatus } from "@shared/tasks";
import { AppDialog } from "@/components/common/dialogs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaskStatusBadge } from "./task-ui";

const MAX_NOTE = 500;

/**
 * Xác nhận đổi trạng thái kèm Lý do / ghi chú (không bắt buộc). Dùng chung cho kéo thả trên Kanban
 * và các nút trong chi tiết công việc; lý do được lưu vào lịch sử thay đổi của task.
 * Ctrl/⌘ + Enter để xác nhận nhanh.
 */
export function StatusChangeDialog({
  title,
  from,
  to,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  from: TaskStatus;
  to: TaskStatus;
  pending?: boolean;
  onConfirm: (note: string | null) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const confirm = () => onConfirm(note.trim() || null);
  const label = to === "cancelled" ? "Lý do hủy" : to === "in_progress" && from === "review" ? "Cần làm lại gì" : "Lý do / ghi chú";

  return (
    <AppDialog
      open
      onClose={onClose}
      size="md"
      title={`Chuyển sang "${TASK_STATUS_LABELS[to]}"`}
      description={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button variant={to === "cancelled" ? "destructive" : "default"} disabled={pending} onClick={confirm}>
            {pending ? "Đang lưu…" : "Đổi trạng thái"}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <TaskStatusBadge status={from} />
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        <TaskStatusBadge status={to} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status-note">
          {label} <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
        </Label>
        <Textarea
          id="status-note"
          autoFocus
          rows={3}
          maxLength={MAX_NOTE}
          value={note}
          placeholder="Ví dụ: đã gọi khách, chờ phản hồi; thiếu hàng, dời sang tuần sau…"
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              confirm();
            }
          }}
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {note.length}/{MAX_NOTE}
        </p>
      </div>
    </AppDialog>
  );
}
