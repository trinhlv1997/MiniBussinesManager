import { describe, expect, it } from "vitest";
import { columnName, crc32, toXlsx } from "../src/worker/lib/xlsx";
import { sheetRows, unzipStored } from "./xlsx-reader";

const build = (headers: string[], rows: (string | number | null)[][], sheet = "Dữ liệu") => {
  const files = unzipStored(toXlsx(sheet, headers, rows));
  return { files, rows: sheetRows(files.get("xl/worksheets/sheet1.xml")!) };
};

describe("xlsx writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("names columns past Z", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("writes a valid package with every required part", () => {
    const { files } = build(["A"], [["x"]]);
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  it("types cells so Excel can calculate, sort and keep leading zeros", () => {
    const { rows } = build(
      ["Mã", "SĐT", "Tiền", "Ngày", "Lúc", "Trống"],
      [["KH0001", "0901234567", 1_250_000, "21/09/2026", "21/09/2026 08:30", null]],
    );
    const [header, row] = rows;
    expect(header!.every((cell) => cell.style === "1" && cell.type === "text")).toBe(true);
    expect(row!.map((cell) => [cell.type, cell.value])).toEqual([
      ["text", "KH0001"],
      ["text", "0901234567"],
      ["number", "1250000"],
      ["date", String(Date.UTC(2026, 8, 21) / 86_400_000 + 25_569)],
      ["date", String(Date.UTC(2026, 8, 21, 8, 30) / 86_400_000 + 25_569)],
    ]);
  });

  it("keeps formulas as plain text and strips characters XML cannot hold", () => {
    const { rows, files } = build(["Ghi chú"], [['=HYPERLINK("x") & <b>'], ["a\u0001b"]]);
    expect(rows[1]![0]).toMatchObject({ type: "text", value: '=HYPERLINK("x") & <b>' });
    expect(rows[2]![0]!.value).toBe("ab");
    expect(files.get("xl/worksheets/sheet1.xml")).not.toContain("<f>");
  });

  it("does not turn impossible dates into dates", () => {
    const { rows } = build(["Ngày"], [["31/02/2026"]]);
    expect(rows[1]![0]!.type).toBe("text");
  });

  it("freezes and filters the header row and sizes columns", () => {
    const { files } = build(["Tên", "Ghi chú"], [["Công ty Cổ phần Cơ điện Hoàng Gia", "x".repeat(200)]], "Khách hàng: VIP/2026");
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:B2"/>');
    expect(sheet).toMatch(/<col min="1" max="1" width="35"/);
    expect(sheet).toMatch(/<col min="2" max="2" width="60"/);
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Khách hàng  VIP 2026"');
  });
});
