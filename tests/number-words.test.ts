import { describe, expect, it } from "vitest";
import { vndInWords } from "../src/shared/number-words";

describe("vndInWords", () => {
  it.each([
    [0, "Không đồng"],
    [5, "Năm đồng"],
    [10, "Mười đồng"],
    [11, "Mười một đồng"],
    [15, "Mười lăm đồng"],
    [21, "Hai mươi mốt đồng"],
    [25, "Hai mươi lăm đồng"],
    [105, "Một trăm lẻ năm đồng"],
    [110, "Một trăm mười đồng"],
    [1000, "Một nghìn đồng"],
    [1005, "Một nghìn không trăm lẻ năm đồng"],
    [1_250_000, "Một triệu hai trăm năm mươi nghìn đồng"],
    [1_005_000, "Một triệu không trăm lẻ năm nghìn đồng"],
    [15_000_000, "Mười lăm triệu đồng"],
    [20_010_001, "Hai mươi triệu không trăm mười nghìn không trăm lẻ một đồng"],
    [1_000_000_000, "Một tỷ đồng"],
    [1_000_005_000, "Một tỷ không trăm lẻ năm nghìn đồng"],
    [2_500_000_000, "Hai tỷ năm trăm triệu đồng"],
    [1_000_000_000_000, "Một nghìn tỷ đồng"],
  ])("%i → %s", (amount, words) => {
    expect(vndInWords(amount)).toBe(words);
  });

  it("supports the accounting-voucher wording (ngàn, chẵn)", () => {
    expect(vndInWords(1_584_000, { thousand: "ngàn", even: true })).toBe(
      "Một triệu năm trăm tám mươi bốn ngàn đồng chẵn",
    );
    expect(vndInWords(1_000_005_000, { thousand: "ngàn" })).toBe("Một tỷ không trăm lẻ năm ngàn đồng");
  });

  it("rejects negative and fractional amounts", () => {
    expect(() => vndInWords(-1)).toThrow(RangeError);
    expect(() => vndInWords(1.5)).toThrow(RangeError);
  });
});
