import { KeyRound, LogOut, Moon, Sun } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { findNavigationItem } from "@/app/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useLogout, useSession } from "@/features/auth/use-auth";
import { useTheme } from "@/hooks/use-theme";

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/);
  const last = words.at(-1)?.[0] ?? "";
  const previous = words.length > 1 ? (words.at(-2)?.[0] ?? "") : "";
  return `${previous}${last}`.toUpperCase();
}

function AppBreadcrumb() {
  const { pathname } = useLocation();
  const current = findNavigationItem(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {current && current.path !== "/" && (
          <>
            <BreadcrumbItem className="hidden sm:block">
              <BreadcrumbLink asChild>
                <Link to="/">Tổng quan</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
          </>
        )}
        <BreadcrumbItem>
          <BreadcrumbPage>{current?.label ?? "Không tìm thấy trang"}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function AppHeader() {
  const { data: admin } = useSession();
  const { theme, toggleTheme } = useTheme();
  const logout = useLogout();
  const navigate = useNavigate();
  const themeLabel = theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";

  const handleLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => navigate("/dang-nhap", { replace: true }),
      onError: (error) => toast.error(error.message),
    });

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger aria-label="Đóng hoặc mở thanh menu" title="Đóng hoặc mở thanh menu" />
      <Separator orientation="vertical" className="mr-1 !h-4" />
      <AppBreadcrumb />

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={themeLabel} title={themeLabel} onClick={toggleTheme}>
          {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Tài khoản">
              <Avatar className="size-8">
                <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                  {admin ? initialsOf(admin.displayName) : ""}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium text-foreground">{admin?.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{admin?.username}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/cai-dat">
                <KeyRound aria-hidden />
                Đổi mật khẩu
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={logout.isPending} onSelect={handleLogout}>
              <LogOut aria-hidden />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
