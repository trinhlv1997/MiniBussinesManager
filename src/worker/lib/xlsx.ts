/**
 * Minimal .xlsx (Office Open XML) writer for one-sheet exports.
 *
 * Written by hand instead of using a library so the Worker bundle stays small and the CPU cost
 * stays low on the Free plan: the zip is stored without compression (Excel opens it normally),
 * and strings are written inline so no shared-strings table is built.
 */

export type CellValue = string | number | null | undefined;

const MAX_CELL_TEXT = 32_767; // Excel's limit per cell
const MAX_COLUMN_WIDTH = 60;

/** Style indexes into cellXfs in STYLES below. */
const STYLE = { header: 1, number: 2, date: 3, dateTime: 4 } as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF8EA9C8"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// XML 1.0 forbids most control characters; they can come from pasted text.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

// eslint-disable-next-line no-control-regex -- detects the same control characters as INVALID_XML
const NEEDS_ESCAPE = /[&<>"\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

const escapeXml = (text: string) =>
  // Most cells contain nothing to escape; skip the five regex passes for them.
  !NEEDS_ESCAPE.test(text)
    ? text
    : text
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 0 → "A", 25 → "Z", 26 → "AA" */
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/**
 * Dates are formatted by the app as "dd/mm/yyyy" or "dd/mm/yyyy hh:mm" (Vietnam time).
 * Writing them as real Excel dates lets users sort and filter by date.
 */
const DATE_TEXT = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/;
const EXCEL_EPOCH_OFFSET = 25_569; // days from 1899-12-30 to 1970-01-01

function excelDate(text: string): { serial: number; withTime: boolean } | null {
  // Cheap shape check first: the regex only runs on "dd/mm/yyyy" or "dd/mm/yyyy hh:mm".
  if ((text.length !== 10 && text.length !== 16) || text.charCodeAt(2) !== 47 || text.charCodeAt(5) !== 47) return null;
  const match = DATE_TEXT.exec(text);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour ?? 0), Number(minute ?? 0));
  const check = new Date(ms);
  if (check.getUTCDate() !== Number(day) || check.getUTCMonth() !== Number(month) - 1) return null;
  return { serial: ms / 86_400_000 + EXCEL_EPOCH_OFFSET, withTime: hour !== undefined };
}

function cellXml(ref: string, value: CellValue): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return `<c r="${ref}" s="${STYLE.number}"><v>${value}</v></c>`;
  }
  const date = excelDate(value);
  if (date) return `<c r="${ref}" s="${date.withTime ? STYLE.dateTime : STYLE.date}"><v>${date.serial}</v></c>`;
  // Inline strings are never evaluated as formulas, so "=HYPERLINK(...)" stays plain text.
  const text = escapeXml(value.slice(0, MAX_CELL_TEXT));
  const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"><is><t${space}>${text}</t></is></c>`;
}

/** Excel shows a warning triangle on every "number stored as text" (phone, tax code); hide it. */
const IGNORE_TEXT_NUMBERS = (range: string) =>
  `<ignoredErrors><ignoredError sqref="${range}" numberStoredAsText="1"/></ignoredErrors>`;

/** Display width of a whole number with "." thousand separators, without calling toLocaleString. */
function numberWidth(value: number): number {
  const digits = String(Math.trunc(Math.abs(value))).length;
  return digits + Math.floor((digits - 1) / 3) + (value < 0 ? 1 : 0);
}

function sheetXml(headers: string[], rows: CellValue[][]): string {
  const letters = headers.map((_, i) => columnName(i));
  const lastColumn = columnName(Math.max(headers.length - 1, 0));
  const lastRow = rows.length + 1;
  const range = `A1:${lastColumn}${lastRow}`;

  // Column width ≈ longest text in the column (in characters), so nothing is cut off.
  const widths = headers.map((header, column) => {
    let longest = header.length;
    for (const row of rows) {
      const value = row[column];
      const length = typeof value === "number" ? numberWidth(value) : (value ?? "").length;
      if (length > longest) longest = length;
    }
    return Math.min(Math.max(longest + 2, 8), MAX_COLUMN_WIDTH);
  });

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<dimension ref="${range}"/>`,
    // Header row stays visible while scrolling.
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
    `<cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`,
    "<sheetData>",
    `<row r="1" ht="22" customHeight="1">${headers
      .map((header, i) => `<c r="${columnName(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${escapeXml(header)}</t></is></c>`)
      .join("")}</row>`,
  ];
  rows.forEach((row, r) => {
    const rowNumber = r + 2;
    let cells = "";
    for (let c = 0; c < headers.length; c++) cells += cellXml(letters[c]! + rowNumber, row[c]);
    parts.push(`<row r="${rowNumber}">${cells}</row>`);
  });
  parts.push("</sheetData>", `<autoFilter ref="${range}"/>`, IGNORE_TEXT_NUMBERS(range), "</worksheet>");
  return parts.join("");
}

/** Excel sheet names: max 31 characters and none of : \ / ? * [ ] */
const safeSheetName = (name: string) => name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet1";

function workbookFiles(sheetName: string, headers: string[], rows: CellValue[][]): [string, string][] {
  const name = escapeXml(safeSheetName(sheetName));
  const lastColumn = columnName(Math.max(headers.length - 1, 0));
  const filterRange = `'${name.replace(/'/g, "''")}'!$A$1:$${lastColumn}$${rows.length + 1}`;
  return [
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${filterRange}</definedName></definedNames></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheetXml(headers, rows)],
  ];
}

/* ------------------------------ ZIP (stored) ------------------------------ */

/** Slicing-by-8 tables: 8 bytes per loop instead of 1, several times faster on large sheets. */
const CRC_TABLES = (() => {
  const tables = Array.from({ length: 8 }, () => new Uint32Array(256));
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tables[0]![n] = c >>> 0;
  }
  for (let n = 0; n < 256; n++) {
    for (let t = 1; t < 8; t++) tables[t]![n] = (tables[0]![tables[t - 1]![n]! & 0xff]! ^ (tables[t - 1]![n]! >>> 8)) >>> 0;
  }
  return tables;
})();

export function crc32(bytes: Uint8Array): number {
  const [t0, t1, t2, t3, t4, t5, t6, t7] = CRC_TABLES as [Uint32Array, Uint32Array, Uint32Array, Uint32Array, Uint32Array, Uint32Array, Uint32Array, Uint32Array];
  let crc = 0xffffffff;
  let i = 0;
  const end8 = bytes.length - (bytes.length % 8);
  for (; i < end8; i += 8) {
    const a = (crc ^ (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24))) >>> 0;
    crc =
      t7[a & 0xff]! ^ t6[(a >>> 8) & 0xff]! ^ t5[(a >>> 16) & 0xff]! ^ t4[a >>> 24]! ^
      t3[bytes[i + 4]!]! ^ t2[bytes[i + 5]!]! ^ t1[bytes[i + 6]!]! ^ t0[bytes[i + 7]!]!;
  }
  for (; i < bytes.length; i++) crc = t0[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Builds a zip archive with the files stored (no compression). */
export function zipStored(files: [string, Uint8Array][], now = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const dosTime = (now.getUTCHours() << 11) | (now.getUTCMinutes() << 5) | Math.floor(now.getUTCSeconds() / 2);
  const dosDate = ((now.getUTCFullYear() - 1980) << 9) | ((now.getUTCMonth() + 1) << 5) | now.getUTCDate();

  const entries = files.map(([name, data]) => ({ name: encoder.encode(name), data, crc: crc32(data) }));
  const localSize = entries.reduce((sum, e) => sum + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let offset = 0;
  const offsets: number[] = [];

  for (const e of entries) {
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true); // UTF-8 file names
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, dosTime, true);
    view.setUint16(offset + 12, dosDate, true);
    view.setUint32(offset + 14, e.crc, true);
    view.setUint32(offset + 18, e.data.length, true);
    view.setUint32(offset + 22, e.data.length, true);
    view.setUint16(offset + 26, e.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(e.name, offset + 30);
    out.set(e.data, offset + 30 + e.name.length);
    offset += 30 + e.name.length + e.data.length;
  }

  const centralStart = offset;
  entries.forEach((e, i) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, dosTime, true);
    view.setUint16(offset + 14, dosDate, true);
    view.setUint32(offset + 16, e.crc, true);
    view.setUint32(offset + 20, e.data.length, true);
    view.setUint32(offset + 24, e.data.length, true);
    view.setUint16(offset + 28, e.name.length, true);
    // extra length, comment length, disk number, internal/external attributes stay 0
    view.setUint32(offset + 42, offsets[i]!, true);
    out.set(e.name, offset + 46);
    offset += 46 + e.name.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}

/** One-sheet workbook: bold, frozen, filterable header row and auto-sized columns. */
export function toXlsx(sheetName: string, headers: string[], rows: CellValue[][]): Uint8Array {
  const encoder = new TextEncoder();
  return zipStored(workbookFiles(sheetName, headers, rows).map(([name, xml]) => [name, encoder.encode(xml)]));
}
