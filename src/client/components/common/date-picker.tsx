import { vi } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@shared/format";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RANGE_PRESETS, useDateRange } from "@/hooks/use-date-range";
import { FilterlessSelect } from "./filterless-select";

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const pad = (value: number) => String(value).padStart(2, "0");
const toDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date);
};

export function DatePicker({
  id,
  value,
  onChange,
  invalid,
  label,
  placeholder = "Chọn ngày",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromDay(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={label}
          aria-invalid={invalid}
          className="w-full justify-start font-normal"
        >
          <CalendarDays className="text-muted-foreground" aria-hidden />
          {value ? formatDate(value) : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={vi}
          captionLayout="dropdown"
          formatters={{ formatWeekdayName: (date) => WEEKDAYS[date.getDay()] ?? "" }}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? toDay(date) : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangeFilter() {
  const range = useDateRange();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterlessSelect
        label="Khoảng thời gian"
        value={range.preset}
        options={RANGE_PRESETS}
        onChange={range.setPreset}
      />
      {range.isCustom && (
        <>
          <div className="w-40">
            <DatePicker label="Từ ngày" value={range.from} onChange={range.setFrom} />
          </div>
          <div className="w-40">
            <DatePicker label="Đến ngày" value={range.to} onChange={range.setTo} />
          </div>
        </>
      )}
    </div>
  );
}
