import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import type { ProductCategory } from "@shared/types";
import {
  categorySchema,
  type CategoryFormValues,
  type CategoryInput,
} from "@shared/validation/entities";
import { AppDialog, ConfirmDialog, FormDialog } from "@/components/common/dialogs";
import { TextareaField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntityDialog } from "@/hooks/use-entity-dialog";
import { useSaveForm } from "@/hooks/use-save-form";
import { useDeleteResource, useSaveResource } from "@/lib/resource";
import { CATEGORIES, PRODUCTS, useCategories } from "./product-dialogs";

function CategoryForm({ category, onClose }: { category?: ProductCategory; onClose: () => void }) {
  const form = useForm<CategoryFormValues, unknown, CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      code: category?.code ?? "",
      name: category?.name ?? "",
      description: category?.description ?? "",
    },
  });
  const { errors } = form.formState;
  const { save, formError, pending } = useSaveForm({
    mutation: useSaveResource(CATEGORIES.key, CATEGORIES.path, [PRODUCTS.key]),
    id: category?.id,
    setError: form.setError,
    successMessage: category ? "Đã cập nhật danh mục" : "Đã thêm danh mục",
    onDone: onClose,
  });
  return (
    <FormDialog
      open
      size="md"
      onClose={onClose}
      title={category ? "Chỉnh sửa danh mục" : "Thêm danh mục"}
      error={formError}
      pending={pending}
      onSubmit={form.handleSubmit(save)}
    >
      <FormField label="Tên danh mục" error={errors.name} {...form.register("name")} />
      <FormField label="Mã danh mục" placeholder="Để trống để tự tạo" error={errors.code} {...form.register("code")} />
      <TextareaField label="Mô tả" error={errors.description} {...form.register("description")} />
    </FormDialog>
  );
}

export function CategoryDialog({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const dialog = useEntityDialog<ProductCategory>();
  const remove = useDeleteResource(CATEGORIES.key, CATEGORIES.path, [PRODUCTS.key]);

  return (
    <>
      <AppDialog
        open={!dialog.mode}
        onClose={onClose}
        title="Danh mục sản phẩm"
        size="md"
        footer={
          <Button onClick={dialog.create}>
            <Plus aria-hidden />
            Thêm mới
          </Button>
        }
      >
        {categories.error && <ErrorState description={categories.error.message} />}
        {categories.isPending && <Skeleton className="h-40 w-full" />}
        <ul className="divide-y rounded-lg border">
          {categories.data?.map((category) => (
            <li key={category.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{category.name}</p>
                <p className="text-xs text-muted-foreground">
                  {category.code} · {category.productCount} sản phẩm
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Chỉnh sửa ${category.name}`} onClick={() => dialog.edit(category)}>
                <Pencil aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Xóa ${category.name}`} onClick={() => dialog.remove(category)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </AppDialog>

      {dialog.mode === "create" && <CategoryForm onClose={dialog.close} />}
      {dialog.mode === "edit" && <CategoryForm category={dialog.row} onClose={dialog.close} />}
      {dialog.mode === "delete" && dialog.row && (
        <ConfirmDialog
          open
          title="Xóa danh mục?"
          description={`Danh mục ${dialog.row.name} sẽ bị xóa. Danh mục còn sản phẩm thì không xóa được.`}
          successMessage="Đã xóa danh mục"
          onConfirm={() => remove.mutateAsync(dialog.row!.id)}
          onClose={dialog.close}
        />
      )}
    </>
  );
}
