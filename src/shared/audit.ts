/**
 * Nhật ký hoạt động chỉ giữ trong số ngày này; tác vụ chạy hằng đêm (src/worker/index.ts) xoá phần cũ hơn.
 * Người tạo / sửa cuối lưu riêng trên từng bản ghi nên không mất khi nhật ký bị xoá.
 */
export const AUDIT_RETENTION_DAYS = 30;

/** Nhãn tiếng Việt cho nhật ký hoạt động. Hành động chưa có nhãn hiển thị nguyên mã. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "Đăng nhập",
  "auth.logout": "Đăng xuất",
  "auth.password_changed": "Đổi mật khẩu",
  "user.create": "Tạo tài khoản",
  "user.update": "Sửa tài khoản",
  "user.password_reset": "Đặt lại mật khẩu",
  "employee.create": "Thêm nhân viên",
  "employee.update": "Sửa nhân viên",
  "employee.delete": "Xoá nhân viên",
  "customer.create": "Thêm khách hàng",
  "customer.update": "Sửa khách hàng",
  "customer.delete": "Xoá khách hàng",
  "customer.note_add": "Thêm ghi chú khách hàng",
  "customer.note_delete": "Xoá ghi chú khách hàng",
  "product.create": "Thêm sản phẩm",
  "product.update": "Sửa sản phẩm",
  "product.delete": "Xoá sản phẩm",
  "category.create": "Thêm danh mục",
  "category.update": "Sửa danh mục",
  "category.delete": "Xoá danh mục",
  "inventory.import": "Lập phiếu nhập kho",
  "inventory.export": "Lập phiếu xuất kho",
  "inventory.adjust": "Lập phiếu điều chỉnh",
  "inventory.draft_update": "Sửa phiếu nháp",
  "inventory.confirm": "Xác nhận phiếu kho",
  "inventory.cancel": "Huỷ phiếu kho",
  "inventory.reverse": "Đảo ngược phiếu kho",
  "settings.update": "Sửa thông tin công ty",
  "task.create": "Tạo công việc",
  "task.update": "Sửa công việc",
  "task.delete": "Xoá công việc",
  "task.status": "Đổi trạng thái công việc",
  "task.cancel_request": "Gửi yêu cầu hủy công việc",
  "task.cancel_reject": "Từ chối yêu cầu hủy công việc",
  "team.create": "Tạo nhóm",
  "team.update": "Sửa nhóm",
  "team.delete": "Xoá nhóm",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  admin_user: "Tài khoản",
  employee: "Nhân viên",
  customer: "Khách hàng",
  product: "Sản phẩm",
  product_category: "Danh mục",
  inventory_transaction: "Phiếu kho",
  company_settings: "Cài đặt",
  task: "Công việc",
  team: "Nhóm",
};

export const auditActionLabel = (action: string) => AUDIT_ACTION_LABELS[action] ?? action;
export const auditEntityLabel = (type: string) => AUDIT_ENTITY_LABELS[type] ?? type;
