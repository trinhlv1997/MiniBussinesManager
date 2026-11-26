import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { vnToday, addDays } from "@shared/format";
import { TASK_PRIORITY_LABELS } from "@shared/tasks";
import type { Task } from "@shared/types";
import { taskSchema, type TaskFormValues, type TaskInput } from "@shared/validation/tasks";
import { FormDialog } from "@/components/common/dialogs";
import { DateField, SelectField, TextareaField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { optionsFrom } from "@/components/common/list-controls";
import { Label } from "@/components/ui/label";
import { useSaveForm } from "@/hooks/use-save-form";
import { useSaveTask, useTaskPeople } from "./use-tasks";

/** Tạo / sửa công việc. Danh sách người nhận chỉ gồm người mà tài khoản này được giao việc. */
export function TaskFormDialog({ task, onClose }: { task?: Task; onClose: () => void }) {
  const { people } = useTaskPeople();
  const today = vnToday();
  const form = useForm<TaskFormValues, unknown, TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: task
      ? {
          title: task.title,
          description: task.description ?? "",
          assigneeId: task.assigneeId,
          priority: task.priority,
          startDate: task.startDate ?? "",
          dueDate: task.dueDate,
          requiresReview: task.requiresReview,
        }
      : { title: "", description: "", priority: "medium", startDate: today, dueDate: addDays(today, 1), requiresReview: false },
  });
  const { errors } = form.formState;
  const { save, formError, pending } = useSaveForm({
    mutation: useSaveTask(),
    id: task?.id,
    setError: form.setError,
    successMessage: task ? "Đã lưu công việc" : "Đã tạo và giao công việc",
    onDone: onClose,
  });

  // Người nhận hiện tại vẫn hiện khi sửa, kể cả khi không còn trong nhóm mình (để không vô tình đổi người).
  const assignees = people
    .filter((person) => person.assignable || person.id === task?.assigneeId)
    .map((person) => ({ value: String(person.id), label: person.displayName }));

  return (
    <FormDialog
      open
      onClose={onClose}
      title={task ? "Sửa công việc" : "Tạo công việc"}
      error={formError}
      pending={pending}
      onSubmit={form.handleSubmit(save)}
    >
      <FormField label="Tiêu đề" autoFocus error={errors.title} {...form.register("title")} />
      <TextareaField label="Mô tả" rows={4} error={errors.description} {...form.register("description")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="assigneeId"
          label="Người nhận"
          placeholder={assignees.length ? "Chọn người nhận" : "Chưa có người để giao"}
          options={assignees}
        />
        <SelectField control={form.control} name="priority" label="Độ ưu tiên" options={optionsFrom(TASK_PRIORITY_LABELS)} />
        <DateField control={form.control} name="startDate" label="Ngày bắt đầu" />
        <DateField control={form.control} name="dueDate" label="Hạn chót" />
      </div>
      <Controller
        control={form.control}
        name="requiresReview"
        render={({ field }) => (
          <div className="flex items-start gap-2.5 rounded-lg border p-3">
            <input
              id="requires-review"
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={Boolean(field.value)}
              onChange={(event) => field.onChange(event.target.checked)}
            />
            <Label htmlFor="requires-review" className="block font-normal leading-snug">
              <span className="font-medium">Cần duyệt trước khi hoàn thành</span>
              <span className="block text-muted-foreground">Nhân viên làm xong chuyển sang "Chờ duyệt", Quản lý xác nhận Hoàn thành.</span>
            </Label>
          </div>
        )}
      />
    </FormDialog>
  );
}
