import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  PASSWORD_MIN_LENGTH,
  changePasswordSchema,
  type ChangePasswordInput,
} from "@shared/validation/auth";
import { FormField } from "@/components/common/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useChangePassword, useLogout } from "@/features/auth/use-auth";
import { applyServerErrors } from "@/lib/form-errors";

export function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const logout = useLogout();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    changePassword.mutate(values, {
      onSuccess: () => {
        form.reset();
        toast.success("Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.");
      },
      onError: (error) => setFormError(applyServerErrors(error, form.setError)),
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tài khoản</CardTitle>
        <CardDescription>Sau khi đổi mật khẩu, các phiên đăng nhập trên thiết bị khác sẽ kết thúc.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <FormField label="Mật khẩu hiện tại" type="password" autoComplete="current-password" error={errors.currentPassword} {...form.register("currentPassword")} />
          <FormField label="Mật khẩu mới" type="password" autoComplete="new-password" hint={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`} error={errors.newPassword} {...form.register("newPassword")} />
          <FormField label="Nhập lại mật khẩu mới" type="password" autoComplete="new-password" error={errors.confirmPassword} {...form.register("confirmPassword")} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? "Đang lưu…" : "Đổi mật khẩu"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, {
                  onSuccess: () => navigate("/dang-nhap", { replace: true }),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              <LogOut aria-hidden />
              Đăng xuất
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
