import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { formatNumber, formatVnd, vnToday } from "@shared/format";
import type { CustomerTier } from "@shared/labels";
import { priceForTier, priceLabelForTier, type TierPrices } from "@shared/pricing";
import type { Customer, InventoryTransactionDetail, Product } from "@shared/types";
import { MAX_DOCUMENT_LINES, adjustSchema, exportSchema, importSchema } from "@shared/validation/inventory";
import { FormDialog } from "@/components/common/dialogs";
import { DateField, Field, NumberInput, TextareaField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { applyServerErrors } from "@/lib/form-errors";
import { refreshAfterChange, useResourceDetail } from "@/lib/resource";
import { ProductCombobox } from "./product-combobox";
import { RecipientPicker, type Recipient } from "./recipient-picker";

export type DocumentKind = "import" | "export" | "adjust";

type LineValues = {
  productId: number | "";
  label: string;
  unit: string;
  available?: number;
  defaultPrice?: number;
  /** Ba mức giá của sản phẩm (chỉ phiếu xuất), để điền lại khi đổi khách hàng. */
  prices?: TierPrices;
  /** Người dùng đã gõ đơn giá khác giá theo hạng: không tự ghi đè nữa. */
  manualPrice?: boolean;
  quantity?: number;
  unitPrice?: number | null;
  delta?: number;
};

type DocumentValues = {
  transactionDate: string;
  reference: string;
  customerId: number | null;
  employeeId: number | null;
  recipientLabel: string;
  confirm: boolean;
  reason: string;
  note: string;
  lines: LineValues[];
};

const SCHEMAS = { import: importSchema, export: exportSchema, adjust: adjustSchema };

const TITLES: Record<DocumentKind, string> = {
  import: "Phiếu nhập kho",
  export: "Phiếu xuất kho",
  adjust: "Phiếu điều chỉnh kho",
};

const EMPTY_LINE: LineValues = { productId: "", label: "", unit: "" };

const initialValues = (document?: InventoryTransactionDetail): DocumentValues => ({
  transactionDate: document?.transactionDate ?? vnToday(),
  reference: document?.reference ?? "",
  customerId: document?.customerId ?? null,
  employeeId: document?.employeeId ?? null,
  recipientLabel: document?.recipientCode ? `${document.recipientCode} · ${document.recipientName}` : "",
  confirm: false,
  reason: document?.reason ?? "",
  note: document?.note ?? "",
  lines: document?.lines.map((line) => ({
    productId: line.productId,
    label: `${line.sku} · ${line.productName}`,
    unit: line.unit,
    quantity: Math.abs(line.quantityDelta),
    unitPrice: line.unitPrice,
    delta: line.quantityDelta,
  })) ?? [{ ...EMPTY_LINE }],
});

export function DocumentFormDialog({
  kind,
  document,
  onClose,
}: {
  kind: DocumentKind;
  document?: InventoryTransactionDetail;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const isAdjust = kind === "adjust";
  const form = useForm<DocumentValues>({
    // Extra display fields are dropped by the schema before saving.
    resolver: zodResolver(SCHEMAS[kind] as never) as unknown as Resolver<DocumentValues>,
    defaultValues: initialValues(document),
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const watched = useWatch({ control: form.control, name: "lines" });
  const recipientLabel = useWatch({ control: form.control, name: "recipientLabel" });
  const { errors } = form.formState;
  const isExport = kind === "export";

  // Hạng của khách nhận hàng quyết định giá bán tự điền. Khi sửa phiếu nháp, lấy hạng từ hồ sơ khách.
  // undefined = chưa chọn lại người nhận trong form này.
  const [pickedTier, setPickedTier] = useState<CustomerTier | null | undefined>(undefined);
  const savedCustomer = useResourceDetail<Customer>("customers", "/customers", isExport ? document?.customerId : null);
  const tier = pickedTier !== undefined ? pickedTier : (savedCustomer.data?.tier ?? null);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiRequest(`/inventory/${kind}${document ? `/${document.id}` : ""}`, {
        method: document ? "PUT" : "POST",
        body,
      }),
    onSuccess: () => refreshAfterChange(client, "inventory", "products"),
  });

  // The schema needs to know the intent: only a confirmed export requires a recipient.
  const submit = (confirm: boolean) => (event?: FormEvent) => {
    form.setValue("confirm", confirm);
    return form.handleSubmit((values) => {
      setFormError(null);
      save.mutate(values, {
        onSuccess: () => {
          toast.success(confirm ? "Đã xác nhận phiếu và cập nhật tồn kho" : "Đã lưu phiếu nháp");
          onClose();
        },
        onError: (error) => setFormError(applyServerErrors(error, form.setError)),
      });
    })(event);
  };

  const pickRecipient = ({ customerId, employeeId, label, tier: nextTier }: Recipient) => {
    form.setValue("customerId", customerId);
    form.setValue("employeeId", employeeId);
    form.setValue("recipientLabel", label);
    form.clearErrors(["customerId", "employeeId"]);
    setPickedTier(nextTier);
    // Đổi khách thì điền lại giá theo hạng mới, trừ những dòng đã nhập giá tay.
    form.getValues("lines").forEach((line, index) => {
      if (!line.prices || line.manualPrice) return;
      const price = priceForTier(line.prices, nextTier);
      form.setValue(`lines.${index}.defaultPrice`, price);
      form.setValue(`lines.${index}.unitPrice`, price);
    });
  };

  const pickProduct = (index: number, product: Product) => {
    form.setValue(`lines.${index}.productId`, product.id, { shouldValidate: true });
    form.setValue(`lines.${index}.label`, `${product.sku} · ${product.name}`);
    form.setValue(`lines.${index}.unit`, product.unit);
    form.setValue(`lines.${index}.available`, product.quantity);
    if (isExport) {
      const prices = { distributorPrice: product.distributorPrice, dealerPrice: product.dealerPrice, salePrice: product.salePrice };
      const price = priceForTier(prices, tier);
      form.setValue(`lines.${index}.prices`, prices);
      form.setValue(`lines.${index}.manualPrice`, false);
      form.setValue(`lines.${index}.defaultPrice`, price);
      form.setValue(`lines.${index}.unitPrice`, price);
    } else {
      form.setValue(`lines.${index}.defaultPrice`, kind === "import" ? (product.costPrice ?? undefined) : undefined);
      form.setValue(`lines.${index}.unitPrice`, null);
    }
  };

  /** Gõ giá khác giá theo hạng thì giữ nguyên; xoá trống thì quay về giá theo hạng. */
  const changePrice = (index: number, value: number | undefined) => {
    const line = form.getValues(`lines.${index}`);
    const auto = line.prices ? priceForTier(line.prices, tier) : undefined;
    form.setValue(`lines.${index}.unitPrice`, value ?? null);
    form.setValue(`lines.${index}.manualPrice`, value !== undefined && value !== auto);
  };

  const total = watched.reduce((sum, line) => {
    const price = line.unitPrice ?? line.defaultPrice ?? 0;
    return sum + (line.quantity ?? 0) * price;
  }, 0);
  const linesMessage = errors.lines?.message ?? errors.lines?.root?.message;

  return (
    <FormDialog
      open
      size="xl"
      onClose={onClose}
      title={`${document ? "Sửa" : "Tạo"} ${TITLES[kind].toLowerCase()}`}
      description="Tồn kho chỉ thay đổi khi phiếu được xác nhận. Phiếu đã xác nhận không thể sửa."
      error={formError}
      pending={save.isPending}
      onSubmit={submit(false)}
      actions={
        <>
          <Button type="submit" variant="secondary" disabled={save.isPending}>
            Lưu nháp
          </Button>
          <Button type="button" disabled={save.isPending} onClick={submit(true)}>
            {save.isPending ? "Đang lưu…" : "Lưu và xác nhận"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField control={form.control} name="transactionDate" label={kind === "import" ? "Ngày nhập" : kind === "export" ? "Ngày xuất" : "Ngày điều chỉnh"} />
        {kind === "export" && (
          <Field
            label="Người nhận"
            error={errors.customerId ?? errors.employeeId}
            hint={recipientLabel ? `Đơn giá tự điền: ${priceLabelForTier(tier)}` : "Chọn khách hàng để tự điền giá theo hạng"}
          >
            {({ id, invalid }) => (
              <RecipientPicker
                id={id}
                invalid={invalid}
                label={recipientLabel}
                isEmployee={Boolean(document?.employeeId)}
                onSelect={pickRecipient}
              />
            )}
          </Field>
        )}
        {isAdjust ? (
          <FormField label="Lý do điều chỉnh" error={errors.reason} {...form.register("reason")} />
        ) : (
          <FormField
            label={kind === "export" ? "Số đơn hàng hoặc tham chiếu" : "Nhà cung cấp hoặc tham chiếu"}
            error={errors.reference}
            {...form.register("reference")}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label>Danh sách sản phẩm</Label>
        {lines.fields.map((field, index) => {
          const line = watched[index];
          const lineErrors = errors.lines?.[index];
          const message =
            lineErrors?.productId?.message ??
            lineErrors?.quantity?.message ??
            lineErrors?.delta?.message ??
            lineErrors?.unitPrice?.message;
          const after =
            line?.available === undefined
              ? undefined
              : line.available +
                (isAdjust ? (line.delta ?? 0) : (kind === "import" ? 1 : -1) * (line.quantity ?? 0));

          return (
            <div key={field.id} className="rounded-lg border p-2">
              <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_2.25rem]">
                <ProductCombobox
                  label={line?.label}
                  invalid={Boolean(lineErrors?.productId)}
                  onlyActive={kind === "import"}
                  ariaLabel={`Sản phẩm dòng ${index + 1}`}
                  onSelect={(product) => pickProduct(index, product)}
                />
                <Controller
                  control={form.control}
                  name={isAdjust ? `lines.${index}.delta` : `lines.${index}.quantity`}
                  render={({ field: input }) => (
                    <NumberInput
                      aria-label={`Số lượng dòng ${index + 1}`}
                      placeholder={isAdjust ? "+5 hoặc -5" : "Số lượng"}
                      allowNegative={isAdjust}
                      value={input.value as number | undefined}
                      onChange={input.onChange}
                    />
                  )}
                />
                {isAdjust ? (
                  <span className="text-sm text-muted-foreground">{line?.unit}</span>
                ) : (
                  <Controller
                    control={form.control}
                    name={`lines.${index}.unitPrice`}
                    render={({ field: input }) => (
                      <NumberInput
                        aria-label={`Đơn giá dòng ${index + 1}`}
                        placeholder={line?.defaultPrice === undefined ? "Đơn giá" : formatNumber(line.defaultPrice)}
                        value={input.value}
                        onChange={(value) => (isExport ? changePrice(index, value) : input.onChange(value))}
                      />
                    )}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Xóa dòng ${index + 1}`}
                  disabled={lines.fields.length === 1}
                  onClick={() => lines.remove(index)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {(message || after !== undefined) && (
                <p className={`mt-1 text-xs ${message || (after ?? 0) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {message ??
                    `Tồn hiện tại ${formatNumber(line?.available ?? 0)}, sau phiếu ${(after ?? 0) < 0 ? "-" : ""}${formatNumber(Math.abs(after ?? 0))} ${line?.unit ?? ""}`}
                  {!message && line?.prices && (
                    <span className={line.manualPrice ? "text-amber-700 dark:text-amber-400" : undefined}>
                      {" · "}
                      {line.manualPrice
                        ? `Giá nhập tay (${priceLabelForTier(tier).toLowerCase()}: ${formatNumber(priceForTier(line.prices, tier))})`
                        : priceLabelForTier(tier)}
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
        {linesMessage && <p className="text-sm text-destructive">{linesMessage}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={lines.fields.length >= MAX_DOCUMENT_LINES}
            onClick={() => lines.append({ ...EMPTY_LINE })}
          >
            <Plus aria-hidden />
            Thêm dòng
          </Button>
          {!isAdjust && (
            <p className="text-sm">
              Thành tiền: <span className="font-semibold tabular-nums">{formatVnd(total)}</span>
            </p>
          )}
        </div>
      </div>
      <TextareaField label="Ghi chú" error={errors.note} {...form.register("note")} />
    </FormDialog>
  );
}
