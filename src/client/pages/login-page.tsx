import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useState } from "react";
import { BASE_PATH } from "@shared/base-path";
import { loginSchema, type LoginInput } from "@shared/validation/auth";
import { FormField } from "@/components/common/form-field";
import { PageSkeleton } from "@/components/common/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DevQuickLogin } from "@/features/auth/dev-quick-login";
import { useLogin, useSession } from "@/features/auth/use-auth";
import { applyServerErrors } from "@/lib/form-errors";

export default function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const { errors } = form.formState;

  if (session.isPending) {
    return (
      <div className="mx-auto max-w-md p-6">
        <PageSkeleton />
      </div>
    );
  }
  if (session.data) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    login.mutate(values, {
      onSuccess: () => navigate(from, { replace: true }),
      onError: (error) => {
        setFormError(applyServerErrors(error, form.setError));
        form.resetField("password");
      },
    });
  });

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img src={`${BASE_PATH}/favicon.svg`} alt="" className="size-9" />
          <div>
            <p className="font-semibold">Mini Business Manager</p>
            <p className="text-xs text-muted-foreground">Quản lý thiết bị điện và điện tử</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Đăng nhập</CardTitle>
            <CardDescription>Nhập tài khoản quản trị để tiếp tục.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <FormField
                label="Tên đăng nhập"
                autoComplete="username"
                autoFocus
                error={errors.username}
                {...form.register("username")}
              />
              <FormField
                label="Mật khẩu"
                type="password"
                autoComplete="current-password"
                error={errors.password}
                {...form.register("password")}
              />
              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? "Đang đăng nhập…" : "Đăng nhập"}
              </Button>
            </form>
            {import.meta.env.DEV && (
              <DevQuickLogin
                disabled={login.isPending}
                onPick={(username, password) => {
                  // Điền sẵn form rồi đăng nhập luôn, đi qua đúng luồng đăng nhập thật.
                  form.setValue("username", username);
                  form.setValue("password", password);
                  void onSubmit();
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
