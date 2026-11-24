import type { Role } from "./permissions";

export type ApiSuccess<T> = { success: true; data: T };

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    /** Field name to message, present on validation errors. */
    fields?: Record<string, string>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Tài khoản đang đăng nhập (tên kiểu giữ từ thời chỉ có một quản trị viên). */
export type AdminProfile = {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  /** Hồ sơ nhân viên gắn với tài khoản; dùng để biết khách hàng nào "được phân công" cho người này. */
  employeeId: number | null;
};
export type UserProfile = AdminProfile;

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = { items: T[]; pagination: Pagination };
