import { BASE_PATH } from "@shared/base-path";
import type { ApiResponse } from "@shared/api";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const NETWORK_ERROR = "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}/api${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", NETWORK_ERROR);
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!payload) {
    throw new ApiClientError(response.status, "INVALID_RESPONSE", "Máy chủ phản hồi không hợp lệ");
  }
  if (!payload.success) {
    const { code, message, fields } = payload.error;
    throw new ApiClientError(response.status, code, message, fields);
  }
  return payload.data;
}
