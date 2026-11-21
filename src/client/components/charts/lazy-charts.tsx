import { Suspense, lazy, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Recharts is the largest dependency, so it only loads on pages that draw charts.
const load = <K extends "MovementChart" | "SalesChart" | "TrendChart" | "CountChart" | "CategoryChart">(name: K) =>
  lazy(async () => {
    const module = await import("./charts");
    return { default: module[name] as ComponentType<ComponentProps<(typeof module)[K]>> };
  });

export const MovementChart = load("MovementChart");
export const SalesChart = load("SalesChart");
export const TrendChart = load("TrendChart");
export const CountChart = load("CountChart");
export const CategoryChart = load("CategoryChart");

export function ChartCard({
  title,
  loading,
  className,
  children,
}: {
  title: string;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const placeholder = <Skeleton className="h-[260px] w-full" />;
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? placeholder : <Suspense fallback={placeholder}>{children}</Suspense>}
      </CardContent>
    </Card>
  );
}
