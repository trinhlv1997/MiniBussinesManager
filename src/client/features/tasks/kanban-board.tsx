import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { vnToday } from "@shared/format";
import type { Role } from "@shared/permissions";
import { TASK_STATUSES, TASK_STATUS_LABELS, allowedTransitions, isOverdue, type TaskStatus } from "@shared/tasks";
import type { Task } from "@shared/types";
import { cn } from "@/lib/utils";
import { StatusChangeDialog } from "./status-change-dialog";
import { DueDate, OverdueBadge, PersonAvatar, PriorityBadge, STATUS_COLORS } from "./task-ui";
import { useChangeStatus, useTaskPeople } from "./use-tasks";

/** Cột nhận thẻ là cột đang nằm dưới ngón tay / con trỏ; ngoài mọi cột thì lấy cột thẻ đè lên nhiều nhất. */
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

/** Nội dung thẻ task, dùng cho cả thẻ trên cột và bản "bay theo tay" khi đang kéo. */
function TaskCardBody({ task, today }: { task: Task; today: string }) {
  const { personOf } = useTaskPeople();
  const overdue = isOverdue(task, today);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">{task.title}</p>
        <PersonAvatar person={personOf(task.assigneeId)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {overdue && <OverdueBadge />}
        {task.cancelRequestedAt && (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            <Ban className="size-3" aria-hidden />
            Xin hủy
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <DueDate dueDate={task.dueDate} overdue={overdue} />
        <span className="truncate text-xs text-muted-foreground">{personOf(task.assigneeId)?.displayName}</span>
      </div>
    </>
  );
}

const cardClass = "rounded-lg border border-l-4 bg-card p-3 text-left shadow-xs";

function DraggableCard({ task, today, onOpen }: { task: Task; today: string; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      aria-label={`${task.title}. Mở chi tiết, hoặc nhấn giữ để kéo sang cột khác`}
      className={cn(
        cardClass,
        STATUS_COLORS[task.status].border,
        "w-full cursor-grab touch-manipulation transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <TaskCardBody task={task} today={today} />
    </button>
  );
}

function Column({
  status,
  tasks,
  today,
  dragging,
  canDrop,
  onOpen,
}: {
  status: TaskStatus;
  tasks: Task[];
  today: string;
  dragging: boolean;
  canDrop: boolean;
  onOpen: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrop });
  return (
    <section
      ref={setNodeRef}
      aria-label={`Cột ${TASK_STATUS_LABELS[status]}`}
      className={cn(
        "flex w-[min(85vw,18rem)] shrink-0 snap-start flex-col rounded-xl border p-2 transition-colors lg:w-auto lg:min-w-0 lg:flex-1",
        STATUS_COLORS[status].column,
        // Khi đang kéo: cột thả được thì viền nổi, cột không hợp lệ thì mờ đi.
        dragging && canDrop && "border-primary/50 border-dashed",
        dragging && !canDrop && "opacity-50",
        isOver && canDrop && "bg-primary/10 ring-2 ring-primary/40",
      )}
    >
      <header className="flex items-center gap-2 px-1 pt-1 pb-2">
        <span className={cn("size-2.5 rounded-full", STATUS_COLORS[status].dot)} aria-hidden />
        <h2 className="text-sm font-semibold">{TASK_STATUS_LABELS[status]}</h2>
        <span className="ml-auto rounded-full bg-background px-2 text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} today={today} onOpen={onOpen} />
        ))}
        {tasks.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">Không có công việc</p>}
      </div>
    </section>
  );
}

/**
 * Bảng Kanban. Kéo thẻ sang cột khác để đổi trạng thái; chỉ các cột hợp lệ với vai trò hiện tại
 * nhận thẻ (cùng quy tắc với server). Trên điện thoại: nhấn giữ thẻ ~0,2 giây rồi kéo, vuốt ngang để xem cột khác.
 */
export function KanbanBoard({
  tasks,
  role,
  listKey,
  onOpen,
}: {
  tasks: Task[];
  role: Role;
  listKey: readonly unknown[];
  onOpen: (task: Task) => void;
}) {
  const today = vnToday();
  const client = useQueryClient();
  const changeStatus = useChangeStatus();
  const [active, setActive] = useState<Task | null>(null);
  // Thẻ vừa thả vào cột hợp lệ: hỏi lý do (không bắt buộc) trước khi đổi trạng thái thật.
  const [pendingMove, setPendingMove] = useState<{ task: Task; to: TaskStatus } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Giữ một chút mới kéo, để vuốt cuộn trang trên điện thoại vẫn bình thường.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const allowed = active ? allowedTransitions(role, active) : [];

  const handleStart = (event: DragStartEvent) => setActive((event.active.data.current?.task as Task | undefined) ?? null);

  const handleEnd = (event: DragEndEvent) => {
    const task = event.active.data.current?.task as Task | undefined;
    const target = event.over?.id as TaskStatus | undefined;
    setActive(null);
    if (!task || !target || target === task.status) return;
    if (!allowedTransitions(role, task).includes(target)) {
      toast.warning(`Không thể chuyển sang "${TASK_STATUS_LABELS[target]}"`);
      return;
    }
    setPendingMove({ task, to: target });
  };

  const applyMove = (task: Task, target: TaskStatus, note: string | null) => {
    setPendingMove(null);
    // Cập nhật ngay trên màn hình (optimistic); lỗi thì tải lại từ server và báo cho người dùng.
    client.setQueryData<Task[]>(listKey, (old) => old?.map((row) => (row.id === task.id ? { ...row, status: target } : row)));
    changeStatus.mutate(
      { id: task.id, status: target, from: task.status, note },
      {
        onSuccess: () => toast.success(`Đã chuyển "${task.title}" sang ${TASK_STATUS_LABELS[target]}`),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleStart} onDragEnd={handleEnd} onDragCancel={() => setActive(null)}>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0 lg:snap-none">
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((task) => task.status === status)}
            today={today}
            dragging={Boolean(active)}
            canDrop={!active || status === active.status || allowed.includes(status)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>
        {active && (
          <div className={cn(cardClass, STATUS_COLORS[active.status].border, "w-[min(85vw,18rem)] rotate-2 shadow-lg")}>
            <TaskCardBody task={active} today={today} />
          </div>
        )}
      </DragOverlay>
      {pendingMove && (
        <StatusChangeDialog
          title={pendingMove.task.title}
          from={pendingMove.task.status}
          to={pendingMove.to}
          onConfirm={(note) => applyMove(pendingMove.task, pendingMove.to, note)}
          onClose={() => setPendingMove(null)}
        />
      )}
    </DndContext>
  );
}
