import { Link } from "react-router";
import type { Customer } from "@shared/types";
import { CustomerTierBadge } from "@/components/common/status";
import { useResourceList } from "@/lib/resource";

/** Khách hàng mà nhân viên đang chăm sóc, hiện trong cửa sổ chi tiết nhân viên. */
export function CaredCustomers({ employeeId }: { employeeId: number }) {
  const list = useResourceList<Customer>("customers", "/customers", {
    careEmployeeId: employeeId,
    pageSize: 50,
    sort: "tier",
    dir: "desc",
  });
  const items = list.data?.items ?? [];
  const total = list.data?.pagination.total ?? 0;

  return (
    <section className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Khách hàng phụ trách{list.data ? ` (${total})` : ""}</h3>
        {total > items.length && (
          <Link to={`/khach-hang?careEmployeeId=${employeeId}`} className="text-sm text-primary hover:underline">
            Xem tất cả
          </Link>
        )}
      </div>
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa được phân công khách hàng nào.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((customer) => (
            <li key={customer.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <Link to={`/khach-hang?search=${encodeURIComponent(customer.code)}`} className="min-w-0 hover:underline">
                <span className="font-medium">{customer.code}</span> · {customer.name}
              </Link>
              <CustomerTierBadge tier={customer.tier} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
