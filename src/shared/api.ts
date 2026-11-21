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

export type AdminProfile = {
  id: number;
  username: string;
  displayName: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = { items: T[]; pagination: Pagination };
