import type { Context } from "hono";
import type { AppEnv } from "../env";
import { toXlsx, type CellValue } from "./xlsx";

/** Upper bound on rows per exported file, to stay inside the Workers Free CPU limit. */
export const MAX_EXPORT_ROWS = 2000;

/**
 * One column of an Excel export. Return a number for money and quantities (Excel can add them up),
 * text for codes and phone numbers (keeps leading zeros), and dates already formatted as
 * dd/mm/yyyy[ hh:mm], which the writer turns into real Excel dates.
 */
export type ExportColumn<T> = { header: string; value: (row: T) => CellValue };

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function excelResponse<T>(
  c: Context<AppEnv>,
  { fileName, sheetName, columns, rows, total }: {
    fileName: string;
    sheetName: string;
    columns: ExportColumn<T>[];
    rows: T[];
    total: number;
  },
) {
  const body = toXlsx(
    sheetName,
    columns.map((column) => column.header),
    rows.map((row) => columns.map((column) => column.value(row))),
  );
  return c.body(body.buffer as ArrayBuffer, 200, {
    "Content-Type": XLSX_TYPE,
    "Content-Disposition": `attachment; filename="${fileName}.xlsx"`,
    "X-Export-Truncated": total > rows.length ? "1" : "0",
  });
}
