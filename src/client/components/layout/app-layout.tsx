import { Suspense, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSession } from "@/features/auth/use-auth";
import { useSettings } from "@/features/settings/use-settings";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

function DocumentTitle() {
  const { data } = useSettings();
  useEffect(() => {
    if (data) document.title = data.appName;
  }, [data]);
  return null;
}

export function AppLayout() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <PageSkeleton />
      </div>
    );
  }
  if (session.isError) {
    return <ErrorState description={session.error.message} onRetry={() => session.refetch()} />;
  }
  if (!session.data) {
    return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <DocumentTitle />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <AppHeader />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
