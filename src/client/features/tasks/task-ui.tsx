import { CalendarClock, Flame } from "lucide-react";
import { formatDate } from "@shared/format";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskPriority, type TaskStatus } from "@shared/tasks";
import type { TaskPerson } from "@shared/types";
import { StatusBadge } from "@/components/common/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Màu từng trạng thái: viền trái của thẻ, chấm ở tiêu đề cột Kanban. */
export const STATUS_COLORS: Record<TaskStatus, { dot: string; border: string; column: string }> = {
  open: { dot: "bg-slate-400", border: "border-l-slate-400", column: "bg-slate-500/5" },
  in_progress: { dot: "bg-blue-500", border: "border-l-blue-500", column: "bg-blue-500/5" },
  review: { dot: "bg-amber-500", border: "border-l-amber-500", column: "bg-amber-500/5" },
  done: { dot: "bg-emerald-500", border: "border-l-emerald-500", column: "bg-emerald-500/5" },
  cancelled: { dot: "bg-zinc-400", border: "border-l-zinc-400", column: "bg-zinc-500/5" },
};

const STATUS_TONES = { open: "neutral", in_progress: "import", review: "warning", done: "success", cancelled: "neutral" } as const;
export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => (
  <StatusBadge tone={STATUS_TONES[status]}>{TASK_STATUS_LABELS[status]}</StatusBadge>
);

const PRIORITY_TONES = { low: "neutral", medium: "info", high: "export", urgent: "danger" } as const;
export const PriorityBadge = ({ priority }: { priority: TaskPriority }) => (
  <StatusBadge tone={PRIORITY_TONES[priority]}>
    {priority === "urgent" && <Flame className="mr-0.5 size-3" aria-hidden />}
    {TASK_PRIORITY_LABELS[priority]}
  </StatusBadge>
);

export const OverdueBadge = () => <StatusBadge tone="danger">Quá hạn</StatusBadge>;

export function DueDate({ dueDate, overdue }: { dueDate: string; overdue: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
      <CalendarClock className="size-3.5" aria-hidden />
      {formatDate(dueDate)}
    </span>
  );
}

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/);
  return ((words.at(-2)?.[0] ?? "") + (words.at(-1)?.[0] ?? "")).toUpperCase() || "?";
}

export function PersonAvatar({ person, size = "sm" }: { person: TaskPerson | undefined; size?: "sm" | "default" }) {
  const name = person?.displayName ?? "Không rõ";
  return (
    <Avatar size={size} title={name}>
      {person?.avatar && <AvatarImage src={person.avatar} alt="" />}
      <AvatarFallback className="bg-primary/10 font-medium text-primary">{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}
