import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminProfile } from "@shared/api";
import { canAccess, type Module } from "@shared/permissions";
import type { ChangePasswordInput, LoginInput } from "@shared/validation/auth";
import { ApiClientError, apiRequest } from "@/lib/api";

export const SESSION_KEY = ["auth", "session"] as const;

async function fetchSession(): Promise<AdminProfile | null> {
  try {
    const { admin } = await apiRequest<{ admin: AdminProfile }>("/auth/me");
    return admin;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export function useSession() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: 5 * 60 * 1000 });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiRequest<{ admin: AdminProfile }>("/auth/login", { body: input }),
    onSuccess: ({ admin }) => queryClient.setQueryData(SESSION_KEY, admin),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<null>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_KEY, null);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiRequest<null>("/auth/change-password", { body: input }),
  });
}

/** Kiểm tra quyền theo chức năng cho tài khoản đang đăng nhập (giao diện chỉ ẩn/hiện; server mới là nơi chặn thật). */
export function useCan() {
  const { data } = useSession();
  return (module: Module) => canAccess(data?.role, module);
}
