import { AUDIT_RETENTION_DAYS, auditActionLabel } from "@shared/audit";
import { formatDateTime } from "@shared/format";
import type { AuditEntry } from "@shared/types";
import { useCan } from "@/features/auth/use-auth";
import { useResourceList } from "@/lib/resource";

type Props = { entityType: string; entityId: number };

/** Lịch sử thao tác trên một bản ghi. Chỉ Admin thấy (nhật ký là chức năng "audit"). */
export function RecordHistory(props: Props) {
  const can = useCan();
  return can("audit") ? <History {...props} /> : null;
}

function History({ entityType, entityId }: Props) {
  const list = useResourceList<AuditEntry>("audit", "/audit-logs", { entityType, entityId, pageSize: 20 });
  const items = list.data?.items ?? [];
  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="text-sm font-medium">
        Lịch sử thay đổi <span className="font-normal text-muted-foreground">({AUDIT_RETENTION_DAYS} ngày gần nhất)</span>
      </h3>
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có thao tác nào trong {AUDIT_RETENTION_DAYS} ngày gần nhất.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-x-3">
              <span>
                {auditActionLabel(item.action)}
                <span className="text-muted-foreground"> · {item.actorName ?? "—"}</span>
              </span>
              <span className="text-muted-foreground tabular-nums">{formatDateTime(item.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
