import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiClientError } from "./api";

/** Puts server field errors on their inputs; returns a message for anything else. */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (error instanceof ApiClientError) {
    if (error.fields) {
      for (const [field, message] of Object.entries(error.fields)) {
        setError(field as Path<T>, { message });
      }
      return null;
    }
    return error.message;
  }
  return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}
