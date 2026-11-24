import { ROLE_LABELS } from "@shared/permissions";
import { DetailGrid } from "@/components/common/dialogs";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { useSession } from "@/features/auth/use-auth";
import { ChangePasswordCard } from "@/features/settings/change-password-card";

/** Mọi vai trò đều vào được: xem tài khoản của mình và đổi mật khẩu. */
export default function AccountPage() {
  const { data: me } = useSession();
  return (
    <>
      <PageHeader title="Tài khoản của tôi" description="Thông tin đăng nhập và đổi mật khẩu." />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card className="p-4">
          {me && (
            <DetailGrid
              items={[
                ["Tên hiển thị", me.displayName],
                ["Tên đăng nhập", me.username],
                ["Vai trò", ROLE_LABELS[me.role]],
              ]}
            />
          )}
        </Card>
        <ChangePasswordCard />
      </div>
    </>
  );
}
