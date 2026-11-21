import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { ApiSuccess } from "@shared/api";
import type { AppEnv } from "../env";
import { ApiError, validationError } from "./errors";

export function ok<T>(c: Context<AppEnv>, data: T, status: ContentfulStatusCode = 200) {
  return c.json<ApiSuccess<T>>({ success: true, data }, status);
}

export async function parseJson<T extends z.ZodType>(
  c: Context<AppEnv>,
  schema: T,
): Promise<z.output<T>> {
  if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Yêu cầu phải ở định dạng JSON");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Dữ liệu gửi lên không đọc được");
  }

  const result = schema.safeParse(body);
  if (!result.success) throw validationError(result.error);
  return result.data;
}
