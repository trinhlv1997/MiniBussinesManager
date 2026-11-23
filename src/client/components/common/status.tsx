import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TYPE_LABELS,
  EMPLOYEE_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  STOCK_STATUS_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  type CustomerTier,
  type CustomerType,
  type EmployeeStatus,
  type ProductStatus,
  type StockStatus,
  type TransactionStatus,
  type TransactionType,
} from "@shared/labels";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TONES = {
  success: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20",
  danger: "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/20",
  info: "bg-accent text-accent-foreground ring-primary/20",
  neutral: "bg-muted text-muted-foreground ring-border",
  import: "bg-blue-50 text-blue-800 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-400/20",
  export: "bg-orange-50 text-orange-800 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-400/20",
};
type Tone = keyof typeof TONES;

export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone])}>
      {children}
    </span>
  );
}

const EMPLOYEE_TONES: Record<EmployeeStatus, Tone> = { active: "success", on_leave: "warning", resigned: "neutral" };
const STOCK_TONES: Record<StockStatus, Tone> = { in_stock: "success", low_stock: "warning", out_of_stock: "danger" };
const DOCUMENT_TONES: Record<TransactionStatus, Tone> = { draft: "warning", confirmed: "success", cancelled: "neutral" };
const DOCUMENT_TYPE_TONES: Record<TransactionType, Tone> = { import: "import", export: "export", adjust: "info", reversal: "neutral" };

export const EmployeeStatusBadge = ({ status }: { status: EmployeeStatus }) => (
  <StatusBadge tone={EMPLOYEE_TONES[status]}>{EMPLOYEE_STATUS_LABELS[status]}</StatusBadge>
);
export const CustomerTypeBadge = ({ type }: { type: CustomerType }) => (
  <StatusBadge tone={type === "business" ? "info" : "neutral"}>{CUSTOMER_TYPE_LABELS[type]}</StatusBadge>
);
export const CustomerTierBadge = ({ tier }: { tier: CustomerTier }) => (
  <StatusBadge tone={tier === "vip" ? "warning" : "neutral"}>
    {tier === "vip" ? "★ " : ""}
    {CUSTOMER_TIER_LABELS[tier]}
  </StatusBadge>
);
export const ProductStatusBadge = ({ status }: { status: ProductStatus }) => (
  <StatusBadge tone={status === "active" ? "success" : "neutral"}>{PRODUCT_STATUS_LABELS[status]}</StatusBadge>
);
export const StockBadge = ({ status }: { status: StockStatus }) => (
  <StatusBadge tone={STOCK_TONES[status]}>{STOCK_STATUS_LABELS[status]}</StatusBadge>
);
export const DocumentStatusBadge = ({ status }: { status: TransactionStatus }) => (
  <StatusBadge tone={DOCUMENT_TONES[status]}>{TRANSACTION_STATUS_LABELS[status]}</StatusBadge>
);
export const DocumentTypeBadge = ({ type }: { type: TransactionType }) => (
  <StatusBadge tone={DOCUMENT_TYPE_TONES[type]}>{TRANSACTION_TYPE_LABELS[type]}</StatusBadge>
);

// Filled cards are reserved for what needs attention; the rest only colour their icon.
const STAT_TONES = {
  neutral: { card: "", chip: "bg-muted text-muted-foreground", text: "", value: "text-foreground/80" },
  success: {
    card: "",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    text: "",
    value: "text-foreground/80",
  },
  primary: {
    card: "border-primary/25 bg-accent ring-primary/25",
    chip: "bg-primary text-primary-foreground",
    text: "text-accent-foreground",
    value: "text-accent-foreground",
  },
  positive: {
    card: "border-emerald-500/35 bg-emerald-50 ring-emerald-500/35 dark:bg-emerald-950/60",
    chip: "bg-emerald-600 text-white",
    text: "text-emerald-900 dark:text-emerald-200",
    value: "text-emerald-800 dark:text-emerald-200",
  },
  info: { card: "", chip: "bg-accent text-accent-foreground", text: "", value: "" },
  import: { card: "", chip: "bg-chart-1/15 text-blue-700 dark:text-blue-300", text: "", value: "" },
  export: { card: "", chip: "bg-chart-2/15 text-orange-700 dark:text-orange-300", text: "", value: "" },
  warning: {
    card: "border-amber-500/40 bg-amber-50 ring-amber-500/40 dark:bg-amber-950/60",
    chip: "bg-amber-500 text-amber-950",
    text: "text-amber-900 dark:text-amber-200",
    value: "text-amber-900 dark:text-amber-200",
  },
  danger: {
    card: "border-red-500/35 bg-red-50 ring-red-500/35 dark:bg-red-950/60",
    chip: "bg-red-600 text-white",
    text: "text-red-900 dark:text-red-200",
    value: "text-red-800 dark:text-red-200",
  },
};
export type StatTone = keyof typeof STAT_TONES;

export function IconChip({ icon: Icon, tone = "neutral" }: { icon: LucideIcon; tone?: StatTone }) {
  return (
    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", STAT_TONES[tone].chip)}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon,
  note,
  loading,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  note?: string;
  loading?: boolean;
  tone?: StatTone;
}) {
  const styles = STAT_TONES[tone];
  return (
    <Card className={cn("gap-1 p-4", styles.card)}>
      <div className={cn("flex items-center justify-between gap-2 text-sm text-muted-foreground", styles.text)}>
        <span>{label}</span>
        <IconChip icon={icon} tone={tone} />
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-24" />
      ) : (
        <p className={cn("text-xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]", styles.value)}>
          {value}
        </p>
      )}
      {note && <p className={cn("text-xs text-muted-foreground", styles.text)}>{note}</p>}
    </Card>
  );
}
