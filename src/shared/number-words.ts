const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

/**
 * Đọc một nhóm 3 chữ số. `full` = có nhóm lớn hơn đứng trước, nên phải đọc đủ
 * "không trăm" / "lẻ" (ví dụ 1.005.000 → "một triệu không trăm lẻ năm nghìn").
 */
function readTriple(value: number, full: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const words: string[] = [];

  if (full || hundreds > 0) words.push(DIGITS[hundreds]!, "trăm");
  if (tens === 0) {
    if (units > 0 && words.length > 0) words.push("lẻ");
  } else if (tens === 1) {
    words.push("mười");
  } else {
    words.push(DIGITS[tens]!, "mươi");
  }
  if (units > 0) {
    if (units === 1 && tens > 1) words.push("mốt");
    else if (units === 5 && tens > 0) words.push("lăm");
    else words.push(DIGITS[units]!);
  }
  return words.join(" ");
}

/** Số < 1 tỷ, đọc theo các nhóm triệu / nghìn / đơn vị. */
function readBelowBillion(value: number, full: boolean, thousand: string): string {
  const groups: [number, string][] = [
    [Math.floor(value / 1_000_000), "triệu"],
    [Math.floor((value % 1_000_000) / 1000), thousand],
    [value % 1000, ""],
  ];
  const words: string[] = [];
  for (const [group, unit] of groups) {
    if (group === 0) continue;
    words.push(readTriple(group, full || words.length > 0));
    if (unit) words.push(unit);
  }
  return words.join(" ");
}

function readNumber(value: number, thousand: string): string {
  if (value === 0) return DIGITS[0]!;
  if (value < 1_000_000_000) return readBelowBillion(value, false, thousand);
  const billions = Math.floor(value / 1_000_000_000);
  const rest = value % 1_000_000_000;
  const head = `${readNumber(billions, thousand)} tỷ`;
  return rest === 0 ? head : `${head} ${readBelowBillion(rest, true, thousand)}`;
}

export type InWordsOptions = {
  /** "nghìn" (mặc định) hoặc "ngàn" như mẫu chứng từ kế toán của MISA. */
  thousand?: "nghìn" | "ngàn";
  /** Thêm "chẵn" sau "đồng", như trên phiếu xuất kho / hoá đơn. */
  even?: boolean;
};

/** 1_250_000 → "Một triệu hai trăm năm mươi nghìn đồng". Dùng cho dòng "Số tiền viết bằng chữ". */
export function vndInWords(amount: number, { thousand = "nghìn", even = false }: InWordsOptions = {}): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError("Số tiền phải là số nguyên không âm");
  const text = `${readNumber(amount, thousand)} đồng${even ? " chẵn" : ""}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
