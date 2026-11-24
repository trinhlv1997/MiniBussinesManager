import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@shared/format";
import type { UserName } from "@shared/types";
import { apiRequest } from "@/lib/api";

export const USER_NAMES_KEY = ["user-names"] as const;

/** Tên mọi tài khoản (ít, lấy một lần) để hiển thị "Tạo bởi …" mà không cần nối bảng ở từng API. */
export function useUserNames() {
  const query = useQuery({
    queryKey: USER_NAMES_KEY,
    queryFn: () => apiRequest<UserName[]>("/user-names"),
    staleTime: 5 * 60 * 1000,
  });
  const names = new Map(query.data?.map((user) => [user.id, user.displayName]));
  return (id: number | null | undefined) => (id ? (names.get(id) ?? "Tài khoản đã xoá") : null);
}

type Authored = {
  createdBy: number | null;
  createdAt: string;
  updatedBy: number | null;
  updatedAt?: string;
};

/** Dòng "Tạo bởi … · lúc …" / "Sửa lần cuối …" cho DetailGrid. Bản ghi cũ không rõ người tạo hiện "—". */
export function useAuthorshipItems() {
  const nameOf = useUserNames();
  const line = (userId: number | null, at: string | null | undefined) => {
    const who = nameOf(userId);
    const when = formatDateTime(at);
    return who ? `${who} · ${when}` : when || null;
  };
  return (record: Authored): [string, string | null][] => [
    ["Tạo bởi", line(record.createdBy, record.createdAt)],
    ...(record.updatedAt ? ([["Sửa lần cuối", line(record.updatedBy, record.updatedAt)]] as [string, string | null][]) : []),
  ];
}
