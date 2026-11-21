import type { Context } from "hono";
import type { AppEnv } from "../env";

export const MAX_EXPORT_ROWS = 2000;
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  // A leading apostrophe stops spreadsheets from running the text as a formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((column) => cell(column.header)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => cell(column.value(row))).join(","));
  // The byte order mark makes Excel read Vietnamese as UTF-8.
  return `${BYTE_ORDER_MARK}${lines.join("\r\n")}\r\n`;
}

export function csvResponse<T>(
  c: Context<AppEnv>,
  fileName: string,
  columns: CsvColumn<T>[],
  rows: T[],
  total: number,
) {
  return c.body(toCsv(columns, rows), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${fileName}.csv"`,
    "X-Export-Truncated": total > rows.length ? "1" : "0",
  });
}
