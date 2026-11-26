import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Control, type FieldValues, type Path } from "react-hook-form";
import { toast } from "sonner";
import { ROLE_LABELS } from "@shared/permissions";
import { PASSWORD_MIN_LENGTH } from "@shared/validation/auth";
import type { UserAccount } from "@shared/types";
import {
  resetPasswordSchema,
  userCreateSchema,
  userUpdateSchema,
  type UserCreateInput,
  type UserCreateValues,
  type UserUpdateInput,
  type UserUpdateValues,
} from "@shared/validation/users";
import { FormDialog } from "@/components/common/dialogs";
import { Field, SelectField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { optionsFrom } from "@/components/common/list-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployeeOptions } from "@/features/employees/use-employee-options";
import { useSaveForm } from "@/hooks/use-save-form";
import { apiRequest } from "@/lib/api";
import { applyServerErrors } from "@/lib/form-errors";
import { useSaveResource } from "@/lib/resource";

export const USERS = { key: "users", path: "/users" };

/** Radix Select không nhận giá trị rỗng: "none" = không gắn nhân viên. */
const NONE = "none";

function EmployeeLinkField<T extends FieldValues>({ control, name, current }: { control: Control<T>; name: Path<T>; current?: UserAccount }) {
  const { options } = useEmployeeOptions();
  const all =
    current?.employeeId && !options.some((o) => o.value === String(current.employeeId))
      ? [...options, { value: String(current.employeeId), label: `${current.employeeCode} · ${current.employeeName}` }]
      : options;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          label="Nhân viên gắn với tài khoản"
          hint="Tài khoản Nhân viên thấy các khách hàng được phân công cho nhân viên này"
          error={fieldState.error}
        >
          {({ id, invalid }) => (
            <Select
              value={field.value ? String(field.value) : NONE}
              onValueChange={(value) => field.onChange(value === NONE ? null : Number(value))}
            >
              <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Không gắn</SelectItem>
                {all.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
    />
  );
}

function ActiveField({ control }: { control: Control<UserUpdateValues, unknown, UserUpdateInput> }) {
  return (
    <Controller
      control={control}
      name="active"
      render={({ field, fieldState }) => (
        <Field label="Trạng thái" hint="Tài khoản bị khoá không đăng nhập được và bị đăng xuất ngay" error={fieldState.error}>
          {({ id, invalid }) => (
            <Select value={field.value ? "true" : "false"} onValueChange={(value) => field.onChange(value === "true")}>
              <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Đang hoạt động</SelectItem>
                <SelectItem value="false">Đã khoá</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
    />
  );
}

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const form = useForm<UserCreateValues, unknown, UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { username: "", displayName: "", password: "", role: "employee", employeeId: null },
  });
  const { errors } = form.formState;
  const { save, formError, pending } = useSaveForm({
    mutation: useSaveResource(USERS.key, USERS.path, ["user-names"]),
    setError: form.setError,
    successMessage: "Đã tạo tài khoản",
    onDone: onClose,
  });
  return (
    <FormDialog open onClose={onClose} title="Thêm tài khoản" error={formError} pending={pending} onSubmit={form.handleSubmit(save)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tên hiển thị" error={errors.displayName} {...form.register("displayName")} />
        <FormField label="Tên đăng nhập" autoComplete="off" error={errors.username} {...form.register("username")} />
        <FormField
          label="Mật khẩu ban đầu"
          type="password"
          autoComplete="new-password"
          hint={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự. Người dùng nên đổi sau khi đăng nhập.`}
          error={errors.password}
          {...form.register("password")}
        />
        <SelectField control={form.control} name="role" label="Vai trò" options={optionsFrom(ROLE_LABELS)} />
      </div>
      <EmployeeLinkField control={form.control} name="employeeId" />
    </FormDialog>
  );
}

function EditUserForm({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const form = useForm<UserUpdateValues, unknown, UserUpdateInput>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: { displayName: user.displayName, role: user.role, employeeId: user.employeeId, active: user.active },
  });
  const { errors } = form.formState;
  const { save, formError, pending } = useSaveForm({
    mutation: useSaveResource(USERS.key, USERS.path, ["user-names"]),
    id: user.id,
    setError: form.setError,
    successMessage: "Đã cập nhật tài khoản",
    onDone: onClose,
  });
  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Sửa tài khoản ${user.username}`}
      error={formError}
      pending={pending}
      onSubmit={form.handleSubmit(save)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tên hiển thị" error={errors.displayName} {...form.register("displayName")} />
        <SelectField control={form.control} name="role" label="Vai trò" options={optionsFrom(ROLE_LABELS)} />
        <ActiveField control={form.control} />
      </div>
      <EmployeeLinkField control={form.control} name="employeeId" current={user} />
    </FormDialog>
  );
}

export function UserFormDialog({ user, onClose }: { user?: UserAccount; onClose: () => void }) {
  return user ? <EditUserForm user={user} onClose={onClose} /> : <CreateUserForm onClose={onClose} />;
}

export function ResetPasswordDialog({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<{ password: string }>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "" } });
  const reset = useMutation({
    mutationFn: (body: { password: string }) => apiRequest(`${USERS.path}/${user.id}/reset-password`, { method: "POST", body }),
  });
  const submit = form.handleSubmit((values) =>
    reset.mutate(values, {
      onSuccess: () => {
        toast.success(`Đã đặt mật khẩu mới cho ${user.displayName}`);
        onClose();
      },
      onError: (error) => setFormError(applyServerErrors(error, form.setError)),
    }),
  );
  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Đặt lại mật khẩu cho ${user.displayName}`}
      description="Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập bằng mật khẩu mới."
      error={formError}
      pending={reset.isPending}
      onSubmit={submit}
    >
      <FormField
        label="Mật khẩu mới"
        type="password"
        autoComplete="new-password"
        hint={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`}
        error={form.formState.errors.password}
        {...form.register("password")}
      />
    </FormDialog>
  );
}
