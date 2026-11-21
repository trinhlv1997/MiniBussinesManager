import { PageHeader } from "@/components/common/page-header";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { ChangePasswordCard } from "@/features/settings/change-password-card";
import { CompanySettingsForm } from "@/features/settings/company-settings-form";
import { useSettings } from "@/features/settings/use-settings";

export default function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="Cài đặt" description="Thông tin công ty, hệ thống và tài khoản." />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {settings.error && <ErrorState description={settings.error.message} onRetry={() => settings.refetch()} />}
        {settings.isPending && <PageSkeleton />}
        {settings.data && <CompanySettingsForm settings={settings.data} />}
        <ChangePasswordCard />
      </div>
    </>
  );
}
