import { addDays, vnToday } from "@shared/format";
import { useListParams } from "./use-list-params";

export const RANGE_PRESETS = [
  { value: "7", label: "7 ngày gần nhất" },
  { value: "30", label: "30 ngày gần nhất" },
  { value: "90", label: "90 ngày gần nhất" },
  { value: "custom", label: "Tùy chọn khoảng ngày" },
];

export function useDateRange() {
  const { get, update } = useListParams();
  const preset = get("range") || "30";
  const today = vnToday();
  const isCustom = preset === "custom";
  const days = Number(preset) || 30;
  const from = isCustom && get("from") ? get("from") : addDays(today, 1 - days);
  const to = isCustom && get("to") ? get("to") : today;

  return {
    preset,
    from,
    to,
    isCustom,
    setPreset: (value: string) =>
      update(value === "custom" ? { range: value, from, to } : { range: value, from: undefined, to: undefined }),
    setFrom: (value: string) => update({ from: value }),
    setTo: (value: string) => update({ to: value }),
  };
}
