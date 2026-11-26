import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { formatNumber, formatVnd } from "@shared/format";
import { PRODUCT_STATUS_LABELS, PRODUCT_UNITS, warrantyLabel } from "@shared/labels";
import type { ProductCategory, ProductDetail } from "@shared/types";
import {
  productSchema,
  type ProductFormValues,
  type ProductInput,
} from "@shared/validation/entities";
import { AppDialog, DetailGrid, FormDialog } from "@/components/common/dialogs";
import { ImageField, NumberField, SelectField, TextareaField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { optionsFrom } from "@/components/common/list-controls";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { ProductStatusBadge, StockBadge } from "@/components/common/status";
import { useSaveForm } from "@/hooks/use-save-form";
import { apiRequest } from "@/lib/api";
import { useResourceDetail, useSaveResource } from "@/lib/resource";
import { RecordHistory } from "@/features/audit/record-history";
import { useAuthorshipItems } from "@/features/users/use-user-names";

export const PRODUCTS = { key: "products", path: "/products" };
export const CATEGORIES = { key: "product-categories", path: "/product-categories" };

export function useCategories() {
  return useQuery({
    queryKey: [CATEGORIES.key],
    queryFn: () => apiRequest<ProductCategory[]>(CATEGORIES.path),
    staleTime: 5 * 60 * 1000,
  });
}

export const categoryOptions = (categories: ProductCategory[] = []) =>
  categories.map((category) => ({ value: String(category.id), label: category.name }));

const UNIT_OPTIONS = PRODUCT_UNITS.map((unit) => ({ value: unit, label: unit }));

function ProductForm({ product, onClose }: { product?: ProductDetail; onClose: () => void }) {
  const categories = useCategories();
  const form = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      categoryId: product?.categoryId ?? "",
      unit: product?.unit ?? "Cái",
      costPrice: product?.costPrice ?? 0,
      salePrice: product?.salePrice ?? 0,
      dealerPrice: product?.dealerPrice ?? null,
      distributorPrice: product?.distributorPrice ?? null,
      minStock: product?.minStock ?? 0,
      brand: product?.brand ?? "",
      specifications: product?.specifications ?? "",
      warrantyMonths: product?.warrantyMonths ?? 12,
      description: product?.description ?? "",
      status: product?.status ?? "active",
      image: product?.image ?? "",
    },
  });
  const { errors } = form.formState;
  const { save, formError, pending } = useSaveForm({
    mutation: useSaveResource(PRODUCTS.key, PRODUCTS.path, ["inventory", CATEGORIES.key]),
    id: product?.id,
    setError: form.setError,
    successMessage: product ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm",
    onDone: onClose,
  });
  const units =
    product && !PRODUCT_UNITS.includes(product.unit as (typeof PRODUCT_UNITS)[number])
      ? [...UNIT_OPTIONS, { value: product.unit, label: product.unit }]
      : UNIT_OPTIONS;

  return (
    <FormDialog
      open
      onClose={onClose}
      title={product ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm"}
      description="Số lượng tồn chỉ thay đổi qua phiếu nhập, xuất hoặc điều chỉnh kho."
      error={formError}
      pending={pending}
      onSubmit={form.handleSubmit(save)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tên sản phẩm" error={errors.name} {...form.register("name")} />
        <FormField label="Mã SKU" placeholder="Để trống để tự tạo" error={errors.sku} {...form.register("sku")} />
        <SelectField control={form.control} name="categoryId" label="Danh mục" placeholder="Chọn danh mục" options={categoryOptions(categories.data)} />
        <FormField label="Thương hiệu" placeholder="Ví dụ: Panasonic" error={errors.brand} {...form.register("brand")} />
        <SelectField control={form.control} name="unit" label="Đơn vị tính" options={units} />
        <NumberField control={form.control} name="warrantyMonths" label="Bảo hành (tháng)" hint="Nhập 0 nếu không bảo hành" />
        <NumberField control={form.control} name="costPrice" label="Giá nhập (₫)" />
        <NumberField control={form.control} name="minStock" label="Số lượng tồn tối thiểu" />
        <SelectField control={form.control} name="status" label="Trạng thái" options={optionsFrom(PRODUCT_STATUS_LABELS)} />
      </div>
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Giá bán theo hạng khách hàng</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            control={form.control}
            name="distributorPrice"
            label="Giá phân phối (₫)"
            placeholder="Bằng giá lẻ"
            hint="Khách VIP (Nhà phân phối)"
          />
          <NumberField
            control={form.control}
            name="dealerPrice"
            label="Giá đại lý (₫)"
            placeholder="Bằng giá lẻ"
            hint="Khách Bình thường (Đại lý)"
          />
          <NumberField control={form.control} name="salePrice" label="Giá khách lẻ (₫)" hint="Khách Cơ bản (Khách lẻ)" />
        </div>
        <p className="text-xs text-muted-foreground">
          Khi lập phiếu xuất, đơn giá tự điền theo hạng của khách hàng. Bỏ trống giá phân phối / đại lý thì dùng giá lẻ.
        </p>
      </fieldset>
      <FormField
        label="Thông số kỹ thuật"
        placeholder="Ví dụ: 220V · 9W · 6500K"
        error={errors.specifications}
        {...form.register("specifications")}
      />
      <TextareaField label="Mô tả" error={errors.description} {...form.register("description")} />
      <ImageField control={form.control} name="image" label="Hình ảnh" />
    </FormDialog>
  );
}

const useDetail = (id?: number) => useResourceDetail<ProductDetail>(PRODUCTS.key, PRODUCTS.path, id);

export function ProductFormDialog({ id, onClose }: { id?: number; onClose: () => void }) {
  const detail = useDetail(id);
  if (!id) return <ProductForm onClose={onClose} />;
  if (detail.data) return <ProductForm product={detail.data} onClose={onClose} />;
  return (
    <AppDialog open onClose={onClose} title="Chỉnh sửa sản phẩm">
      {detail.error ? <ErrorState description={detail.error.message} /> : <PageSkeleton />}
    </AppDialog>
  );
}

export function ProductDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, error } = useDetail(id);
  const authorship = useAuthorshipItems();
  return (
    <AppDialog open onClose={onClose} title={data?.name ?? "Chi tiết sản phẩm"}>
      {error && <ErrorState description={error.message} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <div className="space-y-4">
          {data.image && <img src={data.image} alt="" className="size-24 rounded-lg object-cover" />}
          <DetailGrid
            items={[
              ["Mã SKU", data.sku],
              ["Danh mục", data.categoryName],
              ["Thương hiệu", data.brand],
              ["Thông số kỹ thuật", data.specifications],
              ["Bảo hành", warrantyLabel(data.warrantyMonths)],
              ["Đơn vị tính", data.unit],
              ["Trạng thái", <ProductStatusBadge key="status" status={data.status} />],
              // costPrice = null: tài khoản không được xem giá nhập (Nhân viên) → bỏ hẳn hai dòng liên quan.
              ...(data.costPrice === null ? [] : ([["Giá nhập", formatVnd(data.costPrice)]] as [string, string][])),
              ["Giá phân phối", data.distributorPrice === null ? `${formatVnd(data.salePrice)} (bằng giá lẻ)` : formatVnd(data.distributorPrice)],
              ["Giá đại lý", data.dealerPrice === null ? `${formatVnd(data.salePrice)} (bằng giá lẻ)` : formatVnd(data.dealerPrice)],
              ["Giá khách lẻ", formatVnd(data.salePrice)],
              ["Số lượng tồn", `${formatNumber(data.quantity)} ${data.unit}`],
              ["Tồn tối thiểu", formatNumber(data.minStock)],
              ["Tình trạng tồn kho", <StockBadge key="stock" status={data.stockStatus} />],
              ...(data.costPrice === null ? [] : ([["Giá trị tồn", formatVnd(data.quantity * data.costPrice)]] as [string, string][])),
              ["Mô tả", data.description],
              ...authorship(data),
            ]}
          />
          <RecordHistory entityType="product" entityId={data.id} />
          {data.hasHistory && (
            <p className="text-sm text-muted-foreground">
              Sản phẩm đã có giao dịch kho nên không thể xóa. Nếu không bán nữa, hãy chuyển sang ngừng kinh doanh.
            </p>
          )}
        </div>
      )}
    </AppDialog>
  );
}
