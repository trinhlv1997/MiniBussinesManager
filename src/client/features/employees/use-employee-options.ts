import { EMPLOYEE_STATUS_LABELS } from "@shared/labels";
import type { Employee } from "@shared/types";
import { useResourceList } from "@/lib/resource";

export type EmployeeOption = { value: string; label: string };

/**
 * Nhân viên để chọn làm người chăm sóc khách hàng (công ty khoảng 10 người nên lấy một lần).
 * Nhân viên đã nghỉ việc vẫn hiện, kèm trạng thái, để không mất phân công cũ khi sửa khách hàng.
 */
export function useEmployeeOptions(): { options: EmployeeOption[]; isLoading: boolean } {
  const list = useResourceList<Employee>("employees", "/employees", { pageSize: 100, sort: "fullName", dir: "asc" });
  const options = (list.data?.items ?? []).map((employee) => ({
    value: String(employee.id),
    label:
      employee.status === "active"
        ? `${employee.code} · ${employee.fullName}`
        : `${employee.code} · ${employee.fullName} (${EMPLOYEE_STATUS_LABELS[employee.status]})`,
  }));
  return { options, isLoading: list.isPending };
}
