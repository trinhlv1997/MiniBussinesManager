import { BASE_PATH } from "@shared/base-path";
import { vnToday } from "@shared/format";
import type { ApiFailure } from "@shared/api";
import { ApiClientError } from "./api";

/** Downloads an Excel (.xlsx) export and reports whether the server had to cut it short. */
export async function downloadExcel(path: string, fileName: string): Promise<{ truncated: boolean }> {
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}/api${path}`, { credentials: "same-origin" });
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "Không thể kết nối đến máy chủ");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiFailure | null;
    throw new ApiClientError(
      response.status,
      payload?.error.code ?? "EXPORT_FAILED",
      payload?.error.message ?? "Không thể xuất dữ liệu",
    );
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}-${vnToday()}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
  return { truncated: response.headers.get("X-Export-Truncated") === "1" };
}
