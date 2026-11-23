import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { formatDate, formatDateTime, formatVnd } from "@shared/format";
import { EMPLOYEE_STATUS_LABELS } from "@shared/labels";
import type { EmployeeDetail } from "@shared/types";
import {
  employeeSchema,
  type EmployeeFormValues,
  type EmployeeInput,
} from "@shared/validation/entities";
import { AppDialog, DetailGrid, FormDialog } from "@/components/common/dialogs";
import { DateField, ImageField, NumberField, SelectField, TextareaField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { optionsFrom } from "@/components/common/list-controls";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { EmployeeStatusBadge } from "@/components/common/status";
import { RecipientDocuments } from "@/features/inventory/recipient-documents";
import { useSaveForm } from "@/hooks/use-save-form";
import { useResourceDetail, useSaveResource } from "@/lib/resource";

export const EMPLOYEES = { key: "employees", path: "/employees" };

function EmployeeForm({ employee, onClose }: { employee?: EmployeeDetail; onClose: () => void }) {
  const form = useForm<EmployeeFormValues, unknown, EmployeeInput>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      code: employee?.code ?? "",
      fullName: employee?.fullName ?? "",
      phone: employee?.phone ?? "",
      email: employee?.email ?? "",
      position: employee?.position ?? "",
      hireDate: employee?.hireDate ?? "",
      status: employee?.status ?? "active",
      address: employee?.address ?? "",
      baseSalary: employee?.baseSalary ?? null,
      note: employee?.note ?? "",
      avatar: employee?.avatar ?? "",
    },
  });
  const { errors } = form.formState;
  const { save, formError, pending } = useSaveForm({
    mutation: useSaveResource(EMPLOYEES.key, EMPLOYEES.path),
    id: employee?.id,
    setError: form.setError,
    successMessage: employee ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên",
    onDone: onClose,
  });

  return (
    <FormDialog
      open
      onClose={onClose}
      title={employee ? "Chỉnh sửa nhân viên" : "Thêm nhân viên"}
      error={formError}
      pending={pending}
      onSubmit={form.handleSubmit(save)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Họ và tên" error={errors.fullName} {...form.register("fullName")} />
        <FormField
          label="Mã nhân viên"
          placeholder="Để trống để tự tạo"
          error={errors.code}
          {...form.register("code")}
        />
        <FormField label="Số điện thoại" inputMode="tel" error={errors.phone} {...form.register("phone")} />
        <FormField label="Email" type="email" error={errors.email} {...form.register("email")} />
        <FormField label="Chức vụ" error={errors.position} {...form.register("position")} />
        <DateField control={form.control} name="hireDate" label="Ngày vào làm" />
        <SelectField
          control={form.control}
          name="status"
          label="Trạng thái"
          options={optionsFrom(EMPLOYEE_STATUS_LABELS)}
        />
        <NumberField
          control={form.control}
          name="baseSalary"
          label="Lương cơ bản (₫/tháng)"
          placeholder="Để trống nếu chưa có"
        />
        <FormField label="Địa chỉ" error={errors.address} {...form.register("address")} />
      </div>
      <TextareaField label="Ghi chú" error={errors.note} {...form.register("note")} />
      <ImageField control={form.control} name="avatar" label="Ảnh đại diện" />
    </FormDialog>
  );
}

function useDetail(id?: number) {
  return useResourceDetail<EmployeeDetail>(EMPLOYEES.key, EMPLOYEES.path, id);
}

export function EmployeeFormDialog({ id, onClose }: { id?: number; onClose: () => void }) {
  const detail = useDetail(id);
  if (!id) return <EmployeeForm onClose={onClose} />;
  if (detail.data) return <EmployeeForm employee={detail.data} onClose={onClose} />;
  return (
    <AppDialog open onClose={onClose} title="Chỉnh sửa nhân viên">
      {detail.error ? <ErrorState description={detail.error.message} /> : <PageSkeleton />}
    </AppDialog>
  );
}

export function EmployeeDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, error } = useDetail(id);
  return (
    <AppDialog open onClose={onClose} title={data?.fullName ?? "Chi tiết nhân viên"}>
      {error && <ErrorState description={error.message} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <div className="space-y-4">
          {data.avatar && <img src={data.avatar} alt="" className="size-20 rounded-full object-cover" />}
          <DetailGrid
            items={[
              ["Mã nhân viên", data.code],
              ["Trạng thái", <EmployeeStatusBadge key="status" status={data.status} />],
              ["Số điện thoại", data.phone],
              ["Email", data.email],
              ["Chức vụ", data.position],
              ["Ngày vào làm", formatDate(data.hireDate)],
              ["Lương cơ bản", data.baseSalary === null ? null : `${formatVnd(data.baseSalary)}/tháng`],
              ["Địa chỉ", data.address],
              ["Cập nhật lần cuối", formatDateTime(data.updatedAt)],
              ["Ghi chú", data.note],
            ]}
          />
          <RecipientDocuments filter={{ employeeId: data.id }} />
        </div>
      )}
    </AppDialog>
  );
}
