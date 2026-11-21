import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { formatDateTime } from "@shared/format";
import { CUSTOMER_TYPE_LABELS } from "@shared/labels";
import type { Customer, CustomerDetail } from "@shared/types";
import {
  customerSchema,
  type CustomerFormValues,
  type CustomerInput,
} from "@shared/validation/entities";
import { AppDialog, DetailGrid, FormDialog } from "@/components/common/dialogs";
import { SelectField, TextareaField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { optionsFrom } from "@/components/common/list-controls";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { CustomerTypeBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RecipientDocuments } from "@/features/inventory/recipient-documents";
import { useSaveForm } from "@/hooks/use-save-form";
import { apiRequest } from "@/lib/api";
import { useResourceDetail, useSaveResource } from "@/lib/resource";

export const CUSTOMERS = { key: "customers", path: "/customers" };

export function CustomerFormDialog({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const form = useForm<CustomerFormValues, unknown, CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      code: customer?.code ?? "",
      name: customer?.name ?? "",
      type: customer?.type ?? "individual",
      contactName: customer?.contactName ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
      taxCode: customer?.taxCode ?? "",
      note: customer?.note ?? "",
    },
  });
  const { errors } = form.formState;
  const { save, formError, pending } = useSaveForm({
    mutation: useSaveResource(CUSTOMERS.key, CUSTOMERS.path),
    id: customer?.id,
    setError: form.setError,
    successMessage: customer ? "Đã cập nhật khách hàng" : "Đã thêm khách hàng",
    onDone: onClose,
  });

  return (
    <FormDialog
      open
      onClose={onClose}
      title={customer ? "Chỉnh sửa khách hàng" : "Thêm khách hàng"}
      error={formError}
      pending={pending}
      onSubmit={form.handleSubmit(save)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tên khách hàng" error={errors.name} {...form.register("name")} />
        <FormField label="Mã khách hàng" placeholder="Để trống để tự tạo" error={errors.code} {...form.register("code")} />
        <SelectField control={form.control} name="type" label="Loại khách hàng" options={optionsFrom(CUSTOMER_TYPE_LABELS)} />
        <FormField label="Người liên hệ" error={errors.contactName} {...form.register("contactName")} />
        <FormField label="Số điện thoại" inputMode="tel" error={errors.phone} {...form.register("phone")} />
        <FormField label="Email" type="email" error={errors.email} {...form.register("email")} />
        <FormField label="Mã số thuế" error={errors.taxCode} {...form.register("taxCode")} />
        <FormField label="Địa chỉ" error={errors.address} {...form.register("address")} />
      </div>
      <TextareaField label="Ghi chú" error={errors.note} {...form.register("note")} />
    </FormDialog>
  );
}

function CustomerNotes({ customer }: { customer: CustomerDetail }) {
  const client = useQueryClient();
  const [content, setContent] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: [CUSTOMERS.key, "detail", customer.id] });
  const notesPath = `${CUSTOMERS.path}/${customer.id}/notes`;

  const add = useMutation({
    mutationFn: () => apiRequest(notesPath, { body: { content } }),
    onSuccess: () => {
      setContent("");
      toast.success("Đã thêm ghi chú");
      return refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (noteId: number) => apiRequest(`${notesPath}/${noteId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold">Ghi chú hồ sơ</h3>
      <div className="space-y-2">
        <Textarea
          aria-label="Nội dung ghi chú"
          placeholder="Nhập ghi chú mới"
          rows={2}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <Button size="sm" disabled={!content.trim() || add.isPending} onClick={() => add.mutate()}>
          Thêm ghi chú
        </Button>
      </div>
      <ul className="space-y-2">
        {customer.notes.map((note) => (
          <li key={note.id} className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="break-words whitespace-pre-wrap">{note.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Xóa ghi chú"
              disabled={remove.isPending}
              onClick={() => remove.mutate(note.id)}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
        {customer.notes.length === 0 && <li className="text-sm text-muted-foreground">Chưa có ghi chú.</li>}
      </ul>
    </section>
  );
}

export function CustomerDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, error } = useResourceDetail<CustomerDetail>(CUSTOMERS.key, CUSTOMERS.path, id);
  return (
    <AppDialog open onClose={onClose} title={data?.name ?? "Chi tiết khách hàng"}>
      {error && <ErrorState description={error.message} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <div className="space-y-4">
          <DetailGrid
            items={[
              ["Mã khách hàng", data.code],
              ["Loại khách hàng", <CustomerTypeBadge key="type" type={data.type} />],
              ["Người liên hệ", data.contactName],
              ["Số điện thoại", data.phone],
              ["Email", data.email],
              ["Mã số thuế", data.taxCode],
              ["Địa chỉ", data.address],
              ["Ngày tạo", formatDateTime(data.createdAt)],
              ["Ghi chú chung", data.note],
            ]}
          />
          <RecipientDocuments filter={{ customerId: data.id }} />
          <CustomerNotes customer={data} />
        </div>
      )}
    </AppDialog>
  );
}
