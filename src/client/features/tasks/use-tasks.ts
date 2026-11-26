import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskStatus } from "@shared/tasks";
import type { Task, TaskDetail, TaskPerson } from "@shared/types";
import { apiRequest } from "@/lib/api";
import { toQueryString, type QueryParams } from "@/lib/resource";

export const TASKS_KEY = "tasks";
export const TASK_PEOPLE_KEY = [TASKS_KEY, "people"] as const;

/** Tên, ảnh và quyền giao việc của mọi tài khoản (ít, lấy một lần cho cả trang). */
export function useTaskPeople() {
  const query = useQuery({
    queryKey: TASK_PEOPLE_KEY,
    queryFn: () => apiRequest<TaskPerson[]>("/tasks/people"),
    staleTime: 5 * 60 * 1000,
  });
  const byId = new Map(query.data?.map((person) => [person.id, person]));
  return { people: query.data ?? [], personOf: (id: number | null | undefined) => (id ? byId.get(id) : undefined) };
}

export const taskListKey = (params: QueryParams) => [TASKS_KEY, "list", params] as const;

export function useTaskList(params: QueryParams) {
  return useQuery({
    queryKey: taskListKey(params),
    queryFn: () => apiRequest<Task[]>(`/tasks${toQueryString(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useTaskDetail(id: number | null) {
  return useQuery({
    queryKey: [TASKS_KEY, "detail", id],
    queryFn: () => apiRequest<TaskDetail>(`/tasks/${id}`),
    enabled: Boolean(id),
  });
}

/** Sau mọi thay đổi: tải lại bảng và chi tiết task (lịch sử thay đổi). */
function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: [TASKS_KEY] });
}

export function useSaveTask() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: unknown }) =>
      apiRequest<Task>(id ? `/tasks/${id}` : "/tasks", { method: id ? "PUT" : "POST", body }),
    onSuccess: refresh,
  });
}

export function useDeleteTask() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: number) => apiRequest<null>(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

/** `from` = trạng thái người dùng đang thấy (server báo xung đột nếu ai đó vừa đổi trước); `note` = lý do, không bắt buộc. */
export function useChangeStatus() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, status, from, note }: { id: number; status: TaskStatus; from: TaskStatus; note?: string | null }) =>
      apiRequest<Task>(`/tasks/${id}/status`, { body: { status, from, note } }),
    onSettled: refresh,
  });
}

export function useCancelRequest() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest<Task>(`/tasks/${id}/cancel-request`, { body: { reason } }),
    onSuccess: refresh,
  });
}

export function useRejectCancel() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: number) => apiRequest<Task>(`/tasks/${id}/cancel-request/reject`, { method: "POST" }),
    onSuccess: refresh,
  });
}
