import { PageHeader } from "@/components/common/page-header";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { CompanySettingsForm } from "@/features/settings/company-settings-form";
import { useSettings } from "@/features/settings/use-settings";

export default function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="Cài đặt" description="Thông tin công ty và hệ thống. Đổi mật khẩu ở mục Tài khoản của tôi." />
      <div className="grid items-start gap-4">
        {settings.error && <ErrorState description={settings.error.message} onRetry={() => settings.refetch()} />}
        {settings.isPending && <PageSkeleton />}
        {settings.data && <CompanySettingsForm settings={settings.data} />}
      </div>
    </>
  );
}
