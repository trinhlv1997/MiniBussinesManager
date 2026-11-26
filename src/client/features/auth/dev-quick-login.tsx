import { ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * CHỈ DÙNG KHI PHÁT TRIỂN: nút đăng nhập nhanh bằng các tài khoản demo do `npm run setup` /
 * `npm run db:seed:local` tạo, để thử phân quyền 3 vai trò không phải gõ lại.
 * Trang login chỉ hiện khối này khi `import.meta.env.DEV` (vite dev); bản build production loại bỏ hẳn.
 */
const DEMO_ACCOUNTS = [
  { username: "admin", label: "Quản trị", icon: ShieldCheck },
  { username: "quanly", label: "Quản lý", icon: UsersRound },
  { username: "nhanvien", label: "Nhân viên", icon: UserRound },
] as const;

export function DevQuickLogin({ disabled, onPick }: { disabled: boolean; onPick: (username: string, password: string) => void }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
      <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">Đăng nhập nhanh (chỉ hiện khi chạy ở máy)</p>
      <div className="grid grid-cols-3 gap-2">
        {DEMO_ACCOUNTS.map(({ username, label, icon: Icon }) => (
          <Button
            key={username}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-auto flex-col gap-0.5 py-2"
            // Mật khẩu demo trùng tên đăng nhập (xem scripts/seed.ts).
            onClick={() => onPick(username, username)}
          >
            <Icon aria-hidden />
            <span className="text-xs font-medium">{label}</span>
            <span className="text-[11px] font-normal text-muted-foreground">{username}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
