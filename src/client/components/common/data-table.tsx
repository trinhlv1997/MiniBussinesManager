import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Pagination } from "@shared/api";
import { formatNumber } from "@shared/format";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { useListParams } from "@/hooks/use-list-params";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortKey?: string;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => number | string;
  pagination?: Pagination;
  params?: ReturnType<typeof useListParams>;
  isLoading: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pagination,
  params,
  isLoading,
  error,
  onRetry,
  onRowClick,
  emptyIcon = Inbox,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Không có bản ghi nào phù hợp với bộ lọc hiện tại.",
}: DataTableProps<T>) {
  if (error) return <ErrorState description={error.message} onRetry={onRetry} />;
  if (!isLoading && rows?.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.sortKey && params ? (
                    <SortButton column={column} params={params} />
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading || !rows
              ? Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={index}>
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        <Skeleton className="h-5 w-full min-w-10" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      {pagination && params && <PaginationBar pagination={pagination} params={params} />}
    </div>
  );
}

function SortButton<T>({
  column,
  params,
}: {
  column: Column<T>;
  params: ReturnType<typeof useListParams>;
}) {
  const active = params.get("sort") === column.sortKey;
  const ascending = params.get("dir") === "asc";
  const Icon = !active ? ChevronsUpDown : ascending ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded hover:text-foreground"
      aria-label={`Sắp xếp theo ${column.header}`}
      onClick={() =>
        params.update({ sort: column.sortKey, dir: active && ascending ? "desc" : "asc" })
      }
    >
      {column.header}
      <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
    </button>
  );
}

function PaginationBar({
  pagination,
  params,
}: {
  pagination: Pagination;
  params: ReturnType<typeof useListParams>;
}) {
  const { page, pageSize, total, totalPages } = pagination;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const go = (target: number) => params.update({ page: target }, { keepPage: true });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm text-muted-foreground">
      <span>
        {formatNumber(first)}–{formatNumber(last)} trong {formatNumber(total)} bản ghi
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="px-2 tabular-nums">
          Trang {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Trang sau"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
