/**
 * Small reader for the stored (uncompressed) .xlsx files the app writes, so tests can check
 * cell values and types without a spreadsheet library.
 */
import { columnName, crc32 } from "../src/worker/lib/xlsx";

export type Cell = { ref: string; type: "number" | "text" | "date"; value: string; style: string | null };

/** Reads every file in a stored zip, verifying signatures and CRC-32 like a real unzip would. */
export function unzipStored(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (method !== 0) throw new Error("expected stored entries");
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const data = bytes.subarray(offset + 30 + nameLength + extraLength, offset + 30 + nameLength + extraLength + size);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in ${name}`);
    files.set(name, decoder.decode(data));
    offset += 30 + nameLength + extraLength + size;
  }
  if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("missing central directory");
  return files;
}

const unescape = (text: string) =>
  text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Rows of cells from xl/worksheets/sheet1.xml. Date cells use style 3 or 4. */
export function sheetRows(sheetXml: string): Cell[][] {
  return [...sheetXml.matchAll(/<row [^>]*>(.*?)<\/row>/g)].map(([, row]) =>
    [...row!.matchAll(/<c r="([A-Z]+\d+)"(?: s="(\d+)")?(?: t="(\w+)")?>(.*?)<\/c>/g)].map(([, ref, style, t, inner]) => {
      if (t === "inlineStr") {
        const text = /<t[^>]*>(.*?)<\/t>/s.exec(inner!)?.[1] ?? "";
        return { ref: ref!, type: "text" as const, value: unescape(text), style: style ?? null };
      }
      const value = /<v>(.*?)<\/v>/.exec(inner!)?.[1] ?? "";
      const type = style === "3" || style === "4" ? ("date" as const) : ("number" as const);
      return { ref: ref!, type, value, style: style ?? null };
    }),
  );
}

export async function readXlsx(response: Response) {
  const files = unzipStored(new Uint8Array(await response.arrayBuffer()));
  const rows = sheetRows(files.get("xl/worksheets/sheet1.xml") ?? "");
  const sheetName = /<sheet name="([^"]*)"/.exec(files.get("xl/workbook.xml") ?? "")?.[1] ?? "";
  const headers = rows[0]?.map((cell) => cell.value) ?? [];
  /** Cell under the given header in data row `index` (0 = first data row). */
  const cell = (index: number, header: string) =>
    rows[index + 1]?.find((c) => c.ref === `${columnName(headers.indexOf(header))}${index + 2}`);
  return { files, rows, sheetName: unescape(sheetName), headers, cell, dataRows: rows.slice(1) };
}
