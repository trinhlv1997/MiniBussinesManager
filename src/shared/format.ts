/** Vietnam has one fixed UTC+7 offset, so dates need no timezone database. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, "0");

export const vnToday = (now = new Date()) =>
  new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export function addDays(day: string, amount: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export const vnDayStartUtc = (day: string) => new Date(`${day}T00:00:00+07:00`).toISOString();

/** Exclusive upper bound of a Vietnamese calendar day, in UTC. */
export const vnDayEndUtc = (day: string) => vnDayStartUtc(addDays(day, 1));

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const day = value.length === 10 ? value : vnDayOf(value);
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export const vnDayOf = (timestamp: string) =>
  new Date(Date.parse(timestamp) + VN_OFFSET_MS).toISOString().slice(0, 10);

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const shifted = new Date(Date.parse(value) + VN_OFFSET_MS);
  return `${formatDate(shifted.toISOString().slice(0, 10))} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

export const formatNumber = (value: number) =>
  String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const formatVnd = (value: number) => `${formatNumber(value)} ₫`;
