import { NavLink, useLocation } from "react-router";
import { NAVIGATION, findNavigationItem } from "@/app/navigation";
import { useSettings } from "@/features/settings/use-settings";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const activePath = findNavigationItem(pathname)?.path;
  const { data: settings } = useSettings();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-10 items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <img src={settings?.logo || "/favicon.svg"} alt="" className="size-7 shrink-0 rounded object-cover" />
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {settings?.appName ?? "Mini Business Manager"}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAVIGATION.map(({ path, label, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton
                    asChild
                    isActive={activePath === path}
                    tooltip={label}
                    className="data-active:bg-sidebar-primary data-active:font-semibold data-active:text-sidebar-primary-foreground data-active:hover:bg-sidebar-primary data-active:hover:text-sidebar-primary-foreground data-active:active:bg-sidebar-primary data-active:active:text-sidebar-primary-foreground"
                  >
                    <NavLink to={path} end={path === "/"} onClick={() => setOpenMobile(false)}>
                      <Icon aria-hidden />
                      <span>{label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
