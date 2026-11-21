import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { CompanySettings } from "@shared/types";
import {
  settingsSchema,
  type SettingsFormValues,
  type SettingsInput,
} from "@shared/validation/reports";
import { ImageField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { applyServerErrors } from "@/lib/form-errors";
import { SETTINGS_KEY } from "./use-settings";

export function CompanySettingsForm({ settings }: { settings: CompanySettings }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SettingsFormValues, unknown, SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      companyName: settings.companyName,
      logo: settings.logo ?? "",
      address: settings.address ?? "",
      phone: settings.phone ?? "",
      email: settings.email ?? "",
      taxCode: settings.taxCode ?? "",
      appName: settings.appName,
    },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (body: SettingsInput) => apiRequest<CompanySettings>("/settings", { method: "PUT", body }),
    onSuccess: (saved) => client.setQueryData([SETTINGS_KEY], saved),
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    save.mutate(values, {
      onSuccess: () => toast.success("Đã lưu cài đặt"),
      onError: (error) => setFormError(applyServerErrors(error, form.setError)),
    });
  });

  const fixed: [string, string][] = [
    ["Định dạng ngày", settings.dateFormat],
    ["Đơn vị tiền tệ", settings.currency],
    ["Múi giờ", settings.timezone],
  ];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin công ty</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tên công ty" error={errors.companyName} {...form.register("companyName")} />
          <FormField label="Mã số thuế" error={errors.taxCode} {...form.register("taxCode")} />
          <FormField label="Số điện thoại" inputMode="tel" error={errors.phone} {...form.register("phone")} />
          <FormField label="Email" type="email" error={errors.email} {...form.register("email")} />
          <div className="sm:col-span-2">
            <FormField label="Địa chỉ" error={errors.address} {...form.register("address")} />
          </div>
          <div className="sm:col-span-2">
            <ImageField control={form.control} name="logo" label="Logo" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cài đặt hệ thống</CardTitle>
          <CardDescription>Định dạng được cố định theo chuẩn Việt Nam để số liệu luôn nhất quán.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tên ứng dụng" error={errors.appName} {...form.register("appName")} />
          {fixed.map(([label, value]) => (
            <div key={label} className="space-y-1.5">
              <Label>{label}</Label>
              <Input value={value} disabled aria-label={label} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Đang lưu…" : "Lưu"}
      </Button>
    </form>
  );
}
