import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatNumber, formatVnd } from "@shared/format";
import type { CategoryStock, CountPoint, SalesPoint, StockPoint } from "@shared/types";

const SERIES_1 = "var(--chart-1)";
const SERIES_2 = "var(--chart-2)";
const REVENUE = "var(--chart-revenue)";
const PROFIT = "var(--chart-profit)";
const TICK = { fontSize: 12, fill: "var(--muted-foreground)" };
const HEIGHT = 260;

const periodTick = (period: string) =>
  period.length === 7 ? `${period.slice(5)}/${period.slice(0, 4)}` : `${period.slice(8)}/${period.slice(5, 7)}`;
const periodLabel = (period: string) => (period.length === 7 ? `Tháng ${periodTick(period)}` : formatDate(period));

export function compactNumber(value: number): string {
  const size = Math.abs(value);
  const short = (amount: number, unit: string) =>
    `${amount.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${unit}`;
  if (size >= 1e9) return short(value / 1e9, "tỷ");
  if (size >= 1e6) return short(value / 1e6, "tr");
  if (size >= 1e3) return short(value / 1e3, "N");
  return String(value);
}

type TooltipEntry = { name?: string | number; value?: number | string; color?: string };

function ChartTooltip({
  active,
  title,
  payload,
  format = formatNumber,
}: {
  active?: boolean;
  title: ReactNode;
  payload?: readonly TooltipEntry[];
  format?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: entry.color }} aria-hidden />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{format(Number(entry.value))}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: [label: string, color: string][] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

const axes = (width: number, format: (value: number) => string) => (
  <>
    <CartesianGrid vertical={false} stroke="var(--border)" />
    <XAxis
      dataKey="period"
      tick={TICK}
      tickFormatter={periodTick}
      tickLine={false}
      axisLine={{ stroke: "var(--border)" }}
      minTickGap={28}
    />
    <YAxis
      tick={TICK}
      tickFormatter={format}
      tickLine={false}
      axisLine={false}
      width={width}
      allowDecimals={false}
    />
  </>
);

export function MovementChart({ data }: { data: StockPoint[] }) {
  return (
    <div role="img" aria-label="Biểu đồ số lượng nhập kho và xuất kho theo thời gian">
      <Legend items={[["Nhập kho", SERIES_1], ["Xuất kho", SERIES_2]]} />
      <ResponsiveContainer width="100%" height={HEIGHT - 24}>
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {axes(44, compactNumber)}
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, label, payload }) => (
              <ChartTooltip active={active} title={label ? periodLabel(String(label)) : ""} payload={payload as unknown as TooltipEntry[]} />
            )}
          />
          <Bar dataKey="imported" name="Nhập kho" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={10} isAnimationActive={false} />
          <Bar dataKey="exported" name="Xuất kho" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={10} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SalesChart({ data }: { data: SalesPoint[] }) {
  return (
    <div role="img" aria-label="Biểu đồ doanh thu và lợi nhuận gộp theo thời gian">
      <Legend items={[["Doanh thu", REVENUE], ["Lợi nhuận gộp", PROFIT]]} />
      <ResponsiveContainer width="100%" height={HEIGHT - 24}>
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {axes(56, compactNumber)}
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, label, payload }) => (
              <ChartTooltip
                active={active}
                title={label ? periodLabel(String(label)) : ""}
                payload={payload as unknown as TooltipEntry[]}
                format={formatVnd}
              />
            )}
          />
          <Bar dataKey="revenue" name="Doanh thu" fill={REVENUE} radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive={false} />
          <Bar dataKey="grossProfit" name="Lợi nhuận gộp" fill={PROFIT} radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({
  data,
  dataKey,
  name,
  money = false,
  color = SERIES_1,
}: {
  data: StockPoint[];
  dataKey: "stock" | "value";
  name: string;
  money?: boolean;
  color?: string;
}) {
  return (
    <div role="img" aria-label={`Biểu đồ ${name} theo thời gian`}>
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {axes(56, compactNumber)}
          <Tooltip
            content={({ active, label, payload }) => (
              <ChartTooltip
                active={active}
                title={label ? periodLabel(String(label)) : ""}
                payload={payload as unknown as TooltipEntry[]}
                format={money ? formatVnd : formatNumber}
              />
            )}
          />
          <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountChart({ data, name }: { data: CountPoint[]; name: string }) {
  return (
    <div role="img" aria-label={`Biểu đồ ${name} theo thời gian`}>
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {axes(36, compactNumber)}
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, label, payload }) => (
              <ChartTooltip active={active} title={label ? periodLabel(String(label)) : ""} payload={payload as unknown as TooltipEntry[]} />
            )}
          />
          <Bar dataKey="count" name={name} fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({
  data,
  dataKey,
  name,
  money = false,
  color = SERIES_1,
}: {
  data: CategoryStock[];
  dataKey: "products" | "quantity" | "value";
  name: string;
  money?: boolean;
  color?: string;
}) {
  const format = money ? compactNumber : formatNumber;
  const rows = [...data].sort((a, b) => b[dataKey] - a[dataKey]);
  return (
    <div role="img" aria-label={`Biểu đồ ${name} theo danh mục`}>
      <ResponsiveContainer width="100%" height={Math.max(HEIGHT, rows.length * 40)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={TICK} tickLine={false} axisLine={false} width={120} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, label, payload }) => (
              <ChartTooltip
                active={active}
                title={String(label)}
                payload={payload as unknown as TooltipEntry[]}
                format={money ? formatVnd : formatNumber}
              />
            )}
          />
          <Bar dataKey={dataKey} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList
              dataKey={dataKey}
              position="right"
              formatter={(value: unknown) => format(Number(value))}
              style={{ fontSize: 12, fill: "var(--foreground)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
