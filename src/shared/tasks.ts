import type { Role } from "./permissions";

/**
 * Quy tắc nghiệp vụ của "Quản lý công việc", dùng chung cho server (chặn thật) và giao diện
 * (ẩn nút, tô cột Kanban được thả). Mọi thay đổi quy tắc chỉ sửa ở file này.
 */

export const TASK_STATUSES = ["open", "in_progress", "review", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Mới",
  in_progress: "Đang làm",
  review: "Chờ duyệt",
  done: "Hoàn thành",
  cancelled: "Đã hủy",
};

/** Thứ tự từ thấp đến cao; Kanban sắp xếp "Khẩn" lên đầu. */
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn",
};

/** Trạng thái kết thúc: không tính trễ hạn, không nhận yêu cầu hủy. */
export const isFinalStatus = (status: TaskStatus) => status === "done" || status === "cancelled";

/**
 * Các bước chuyển hợp lệ (với Quản lý / Admin). Done và Cancel chỉ có thể "mở lại" về Mới.
 * Không có bước nhảy ngược tùy ý, để lịch sử trạng thái luôn đọc được.
 */
const FLOW: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["open", "review", "done", "cancelled"],
  review: ["in_progress", "done", "cancelled"],
  done: ["open"],
  cancelled: ["open"],
};

export type TaskForRules = { status: TaskStatus; requiresReview: boolean };

/**
 * Trạng thái mà vai trò này được chuyển task sang.
 * - Nhân viên: Mới → Đang làm → Hoàn thành; task "cần duyệt" thì Đang làm → Chờ duyệt (Quản lý duyệt tiếp).
 *   Không được Hủy (chỉ gửi yêu cầu hủy), không mở lại task đã xong.
 * - Quản lý / Admin: mọi bước trong FLOW, kể cả Hủy và mở lại.
 * Phạm vi (task có thuộc người này / nhóm này không) do server kiểm tra riêng.
 */
export function allowedTransitions(role: Role, task: TaskForRules): TaskStatus[] {
  if (role !== "employee") return [...FLOW[task.status]];
  if (task.status === "open") return ["in_progress"];
  if (task.status === "in_progress") return [task.requiresReview ? "review" : "done"];
  return [];
}

export const canTransition = (role: Role, task: TaskForRules, to: TaskStatus) =>
  allowedTransitions(role, task).includes(to);

/** Tạo / sửa / giao lại task: Admin và Quản lý (trong phạm vi nhóm). Xóa: chỉ Admin. */
export const canManageTasks = (role: Role) => role === "admin" || role === "manager";
export const canDeleteTasks = (role: Role) => role === "admin";

/** Task trễ hạn: đã qua hạn chót (theo ngày Việt Nam) mà chưa Hoàn thành / Hủy. */
export const isOverdue = (task: { status: TaskStatus; dueDate: string }, today: string) =>
  !isFinalStatus(task.status) && task.dueDate < today;

/** Tên trường trong lịch sử thay đổi (task_history.field). */
export const TASK_HISTORY_FIELDS = {
  created: "Tạo công việc",
  status: "Trạng thái",
  title: "Tiêu đề",
  description: "Mô tả",
  assignee: "Người nhận",
  priority: "Độ ưu tiên",
  start_date: "Ngày bắt đầu",
  due_date: "Hạn chót",
  requires_review: "Cần duyệt",
  cancel_request: "Yêu cầu hủy",
} as const;
export type TaskHistoryField = keyof typeof TASK_HISTORY_FIELDS;
