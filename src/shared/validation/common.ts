import { z } from "zod";
import { vi } from "zod/locales";
import { daysBetween, vnToday } from "../format";

// Any message without its own text still reaches the user in Vietnamese.
z.config(vi());

export const MAX_MONEY = 1_000_000_000_000;
export const MAX_QUANTITY = 10_000_000;
export const MAX_IMAGE_LENGTH = 200_000;
export const MAX_DATE_RANGE_DAYS = 366;

export const requiredText = (label: string, max = 200) =>
  z
    .string(`Vui lòng nhập ${label}`)
    .trim()
    .min(1, `Vui lòng nhập ${label}`)
    .max(max, `Tối đa ${max} ký tự`);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự`)
    .nullish()
    .transform((value) => value || null);

/** Blank means the server generates the next code. */
export const optionalCode = z
  .string()
  .trim()
  .max(30, "Tối đa 30 ký tự")
  .regex(/^[A-Za-z0-9._-]*$/, "Chỉ dùng chữ không dấu, số, dấu chấm, gạch ngang")
  .nullish()
  .transform((value) => value?.toUpperCase() || null);

export const optionalPhone = z
  .string()
  .nullish()
  .transform((value) => value?.replace(/[\s.()-]/g, "") || null)
  .refine((value) => value === null || /^(0|\+84)\d{9,10}$/.test(value), {
    message: "Số điện thoại không hợp lệ",
  });

export const optionalEmail = z
  .string()
  .trim()
  .max(254, "Email quá dài")
  .nullish()
  .transform((value) => value?.toLowerCase() || null)
  .refine((value) => value === null || z.email().safeParse(value).success, {
    message: "Email không hợp lệ",
  });

const isRealDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
};

export const dateString = z
  .string("Vui lòng chọn ngày")
  .refine(isRealDate, { message: "Ngày không hợp lệ" });

export const pastOrTodayDate = dateString.refine((value) => value <= vnToday(), {
  message: "Ngày không được ở tương lai",
});

export const optionalDate = z
  .string()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || isRealDate(value), { message: "Ngày không hợp lệ" });

export const money = z
  .number("Vui lòng nhập số tiền")
  .int("Số tiền phải là số nguyên")
  .min(0, "Số tiền không được âm")
  .max(MAX_MONEY, "Số tiền quá lớn");

/** Tiền không bắt buộc: bỏ trống thì lưu null. */
export const optionalMoney = z
  .number("Vui lòng nhập số tiền")
  .int("Số tiền phải là số nguyên")
  .min(0, "Số tiền không được âm")
  .max(MAX_MONEY, "Số tiền quá lớn")
  .nullish()
  .transform((value) => value ?? null);

export const optionalImage = z
  .string()
  .max(MAX_IMAGE_LENGTH, "Ảnh quá lớn")
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Ảnh không hợp lệ")
  .nullish()
  .or(z.literal(""))
  .transform((value) => value || null);

export const idParam = z.coerce
  .number("Vui lòng chọn một mục")
  .int("Vui lòng chọn một mục")
  .positive("Vui lòng chọn một mục");

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const queryText = z.preprocess(blankToUndefined, z.string().trim().max(100).optional());
export const queryId = z.preprocess(blankToUndefined, idParam.optional());
export const queryDate = z.preprocess(blankToUndefined, dateString.optional());
export const queryEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(blankToUndefined, z.enum(values).optional());

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: queryText,
  dir: z.enum(["asc", "desc"]).default("desc"),
};

export const sortQuery = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.enum(values).default(fallback as never);

/** Requires from <= to and a span the charts and Workers CPU limit can handle. */
export const dateRangeQuery = z
  .object({ from: queryDate, to: queryDate })
  .transform((value, context) => {
    const to = value.to ?? vnToday();
    const from = value.from ?? shiftDays(to, -29);
    if (from > to) {
      context.addIssue({ code: "custom", path: ["from"], message: "Từ ngày phải trước đến ngày" });
    } else if (daysBetween(from, to) > MAX_DATE_RANGE_DAYS) {
      context.addIssue({ code: "custom", path: ["from"], message: "Khoảng ngày tối đa 366 ngày" });
    }
    return { from, to };
  });

function shiftDays(day: string, amount: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
}
