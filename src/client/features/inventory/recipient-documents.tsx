import { Link } from "react-router";
import { formatDate, formatNumber, formatVnd } from "@shared/format";
import type { InventoryTransaction } from "@shared/types";
import { DocumentStatusBadge } from "@/components/common/status";
import { useResourceList } from "@/lib/resource";

const LIMIT = 5;

/** Recent export documents of one customer or employee. */
export function RecipientDocuments({ filter }: { filter: { customerId: number } | { employeeId: number } }) {
  const list = useResourceList<InventoryTransaction>("inventory", "/inventory/transactions", {
    ...filter,
    type: "export",
    pageSize: LIMIT,
  });
  const total = list.data?.pagination.total;

  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="text-sm font-semibold">Phiếu xuất kho {total !== undefined && `(${formatNumber(total)})`}</h3>
      {total === 0 && <p className="text-sm text-muted-foreground">Chưa có phiếu xuất kho.</p>}
      <ul className="divide-y">
        {list.data?.items.map((document) => (
          <li key={document.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <Link
                to={`/kho?tab=history&search=${encodeURIComponent(document.code)}`}
                className="font-medium text-primary hover:underline"
              >
                {document.code}
              </Link>
              <p className="text-xs text-muted-foreground">
                {formatDate(document.transactionDate)}
                {document.totalAmount !== null && ` · ${formatVnd(document.totalAmount)}`}
              </p>
            </div>
            <DocumentStatusBadge status={document.status} />
          </li>
        ))}
      </ul>
      {total !== undefined && total > LIMIT && (
        <p className="text-xs text-muted-foreground">Đang hiện {LIMIT} phiếu gần nhất.</p>
      )}
    </section>
  );
}
