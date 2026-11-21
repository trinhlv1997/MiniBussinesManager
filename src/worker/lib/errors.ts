import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export function validationError(error: ZodError): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "_";
    fields[field] ??= issue.message;
  }
  return new ApiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", fields);
}
