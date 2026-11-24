import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { formatDate, formatDateTime, formatNumber, formatVnd } from "@shared/format";
import type { InventoryTransactionDetail } from "@shared/types";
import { AppDialog, ConfirmDialog, DetailGrid } from "@/components/common/dialogs";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { DocumentStatusBadge, DocumentTypeBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/features/settings/use-settings";
import { apiRequest } from "@/lib/api";
import { refreshAfterChange, useResourceDetail } from "@/lib/resource";
import { DocumentFormDialog, type DocumentKind } from "./document-form-dialog";
import { canExportInvoice, downloadInvoicePdf } from "./invoice-pdf";
import { RecordHistory } from "@/features/audit/record-history";
import { useUserNames } from "@/features/users/use-user-names";

const BASE = "/inventory/transactions";

function RecipientLink({ document }: { document: InventoryTransactionDetail }) {
  if (!document.recipientCode) return null;
  const page = document.customerId ? "/khach-hang" : "/nhan-vien";
  return (
    <Link
      to={`${page}?search=${encodeURIComponent(document.recipientCode)}`}
      className="text-primary hover:underline"
    >
      {document.recipientCode} · {document.recipientName}
    </Link>
  );
}

function InvoiceButton({ document }: { document: InventoryTransactionDetail }) {
  const settings = useSettings();
  const download = useMutation({
    mutationFn: () => downloadInvoicePdf(document, settings.data!),
    onSuccess: () => toast.success(`Đã tạo phiếu xuất kho bán hàng ${document.code}`),
    onError: (failure) => toast.error(failure.message || "Không tạo được phiếu PDF"),
  });
  return (
    <Button variant="outline" disabled={!settings.data || download.isPending} onClick={() => download.mutate()}>
      <FileDown aria-hidden />
      {download.isPending ? "Đang tạo PDF..." : "In phiếu xuất kho (PDF)"}
    </Button>
  );
}

function ReverseForm({ onSubmit, pending }: { onSubmit: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label htmlFor="reverse-reason">Lý do đảo ngược</Label>
      <Textarea id="reverse-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      <Button variant="destructive" size="sm" disabled={!reason.trim() || pending} onClick={() => onSubmit(reason)}>
        Xác nhận đảo ngược
      </Button>
    </div>
  );
}

export function DocumentDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const client = useQueryClient();
  const { data, error } = useResourceDetail<InventoryTransactionDetail>("inventory", BASE, id);
  const nameOf = useUserNames();
  const byWhom = (userId: number | null, at: string | null) =>
    at ? [nameOf(userId), formatDateTime(at)].filter(Boolean).join(" · ") : null;
  const [panel, setPanel] = useState<"edit" | "cancel" | "reverse" | null>(null);

  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) =>
      apiRequest(`${BASE}/${id}/${action}`, { method: "POST", body }),
    onSuccess: () => refreshAfterChange(client, "inventory", "products"),
  });
  const run = (action: string, message: string, body?: unknown) =>
    act.mutate(
      { action, body },
      {
        onSuccess: () => {
          toast.success(message);
          setPanel(null);
        },
        onError: (failure) => toast.error(failure.message),
      },
    );

  if (panel === "edit" && data && data.type !== "reversal") {
    return <DocumentFormDialog kind={data.type as DocumentKind} document={data} onClose={() => setPanel(null)} />;
  }

  const isDraft = data?.status === "draft";
  const canReverse = data?.status === "confirmed" && data.type !== "reversal" && !data.reversedBy;
  const canInvoice = data ? canExportInvoice(data) : false;

  return (
    <>
      <AppDialog
        open
        size="xl"
        onClose={onClose}
        title={data ? `Phiếu ${data.code}` : "Chi tiết phiếu kho"}
        footer={
          data && (isDraft || canReverse || canInvoice) ? (
            <>
              {canInvoice && <InvoiceButton document={data} />}
              {isDraft && (
                <>
                  <Button variant="outline" onClick={() => setPanel("cancel")}>Hủy phiếu</Button>
                  <Button variant="secondary" onClick={() => setPanel("edit")}>Chỉnh sửa</Button>
                  <Button disabled={act.isPending} onClick={() => run("confirm", "Đã xác nhận phiếu và cập nhật tồn kho")}>
                    Xác nhận phiếu
                  </Button>
                </>
              )}
              {canReverse && panel !== "reverse" && (
                <Button variant="outline" onClick={() => setPanel("reverse")}>Đảo ngược phiếu</Button>
              )}
            </>
          ) : undefined
        }
      >
        {error && <ErrorState description={error.message} />}
        {!data && !error && <PageSkeleton />}
        {data && (
          <div className="space-y-4">
            <DetailGrid
              items={[
                ["Loại phiếu", <DocumentTypeBadge key="type" type={data.type} />],
                ["Trạng thái", <DocumentStatusBadge key="status" status={data.status} />],
                ["Ngày chứng từ", formatDate(data.transactionDate)],
                ["Lập phiếu", byWhom(data.createdBy, data.createdAt)],
                ["Xác nhận", byWhom(data.confirmedBy, data.confirmedAt)],
                ...(data.type === "export"
                  ? ([["Người nhận", data.recipientCode && <RecipientLink key="recipient" document={data} />]] as [string, ReactNode][])
                  : []),
                ["Tham chiếu", data.reference],
                ["Lý do", data.reason],
                ["Đảo ngược của phiếu", data.reversalOfCode],
                ["Đã được đảo ngược bởi", data.reversedBy?.code],
                ["Ghi chú", data.note],
              ]}
            />
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="text-right">Thay đổi tồn</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p>{line.productName}</p>
                        <p className="text-xs text-muted-foreground">{line.sku}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.quantityDelta > 0 ? "+" : "-"}
                        {formatNumber(Math.abs(line.quantityDelta))} {line.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.unitPrice === null ? "—" : formatVnd(line.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.amount === null ? "—" : formatVnd(line.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {data.totalAmount > 0 && (
              <p className="text-right text-sm">
                Tổng thành tiền: <span className="font-semibold tabular-nums">{formatVnd(data.totalAmount)}</span>
              </p>
            )}
            <RecordHistory entityType="inventory_transaction" entityId={data.id} />
            {panel === "reverse" && (
              <ReverseForm
                pending={act.isPending}
                onSubmit={(reason) => run("reverse", "Đã tạo phiếu đảo ngược", { reason })}
              />
            )}
          </div>
        )}
      </AppDialog>
      {panel === "cancel" && (
        <ConfirmDialog
          open
          title="Hủy phiếu nháp?"
          description="Phiếu sẽ chuyển sang trạng thái đã hủy và không thể xác nhận nữa."
          confirmLabel="Hủy phiếu"
          successMessage="Đã hủy phiếu"
          onConfirm={() => act.mutateAsync({ action: "cancel" })}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  );
}
