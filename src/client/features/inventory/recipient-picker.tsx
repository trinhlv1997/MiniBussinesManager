import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronsUpDown, Plus } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CUSTOMER_TYPE_LABELS } from "@shared/labels";
import { toSearchText } from "@shared/text";
import type { Customer, Employee } from "@shared/types";
import {
  customerSchema,
  type CustomerFormValues,
  type CustomerInput,
} from "@shared/validation/entities";
import { SelectField } from "@/components/common/form-controls";
import { FormField } from "@/components/common/form-field";
import { optionsFrom } from "@/components/common/list-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { applyServerErrors } from "@/lib/form-errors";
import { useResourceList, useSaveResource } from "@/lib/resource";

export type Recipient = { customerId: number | null; employeeId: number | null; label: string };
type Mode = "customer" | "employee";
type Option = { id: number; code: string; name: string; detail: string | null };

const customerLabel = (customer: { code: string; name: string }) => `${customer.code} · ${customer.name}`;

function useOptions(mode: Mode, search: string) {
  const isCustomer = mode === "customer";
  const list = useResourceList<Customer | Employee>(
    isCustomer ? "customers" : "employees",
    isCustomer ? "/customers" : "/employees",
    {
      search,
      pageSize: 8,
      sort: isCustomer ? "name" : "fullName",
      dir: "asc",
      status: isCustomer ? undefined : "active",
    },
  );
  const options = list.data?.items.map((row): Option =>
    "fullName" in row
      ? { id: row.id, code: row.code, name: row.fullName, detail: row.position }
      : { id: row.id, code: row.code, name: row.name, detail: row.phone },
  );
  return { options, isPlaceholder: list.isPlaceholderData };
}

/** Rendered in a portal, so it cannot be a nested form of the document form. */
function NewCustomerForm({
  name,
  onCreated,
  onCancel,
}: {
  name: string;
  onCreated: (customer: Customer) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CustomerFormValues, unknown, CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name, type: "individual", phone: "" },
  });
  const save = useSaveResource<Customer>("customers", "/customers");
  const { errors } = form.formState;

  const submit = form.handleSubmit((body) => {
    setError(null);
    save.mutate(
      { body },
      {
        onSuccess: (customer) => {
          toast.success("Đã thêm vào danh sách khách hàng");
          onCreated(customer);
        },
        onError: (failure) => setError(applyServerErrors(failure, form.setError)),
      },
    );
  });
  const submitOnEnter = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="space-y-3" onKeyDown={submitOnEnter}>
      <p className="text-sm font-medium">Thêm khách hàng mới</p>
      <FormField autoFocus label="Tên khách hàng" error={errors.name} {...form.register("name")} />
      <SelectField control={form.control} name="type" label="Loại khách hàng" options={optionsFrom(CUSTOMER_TYPE_LABELS)} />
      <FormField label="Số điện thoại" inputMode="tel" error={errors.phone} {...form.register("phone")} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Quay lại
        </Button>
        <Button type="button" size="sm" disabled={save.isPending} onClick={() => void submit()}>
          {save.isPending ? "Đang lưu…" : "Lưu khách hàng"}
        </Button>
      </div>
    </div>
  );
}

export function RecipientPicker({
  id,
  label,
  isEmployee,
  invalid,
  onSelect,
}: {
  id?: string;
  label: string;
  isEmployee: boolean;
  invalid?: boolean;
  onSelect: (recipient: Recipient) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(isEmployee ? "employee" : "customer");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const { options, isPlaceholder } = useOptions(mode, search);

  const typed = search.trim();
  const hasExactMatch = options?.some((option) => toSearchText(option.name) === toSearchText(typed));
  const canCreate = mode === "customer" && options !== undefined && !isPlaceholder && !hasExactMatch;

  const finish = (recipient: Recipient) => {
    onSelect(recipient);
    setOpen(false);
    setCreating(false);
    setSearch("");
  };
  const pick = (option: Option) =>
    finish({
      customerId: mode === "customer" ? option.id : null,
      employeeId: mode === "employee" ? option.id : null,
      label: customerLabel(option),
    });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreating(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          className="w-full justify-between font-normal"
        >
          <span className={label ? "truncate" : "truncate text-muted-foreground"}>
            {label || "Chọn khách hàng hoặc nhân viên"}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
        {creating ? (
          <NewCustomerForm
            name={typed}
            onCancel={() => setCreating(false)}
            onCreated={(customer) =>
              finish({ customerId: customer.id, employeeId: null, label: customerLabel(customer) })
            }
          />
        ) : (
          <>
            <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["customer", "employee"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={mode === value ? "default" : "ghost"}
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                >
                  {value === "customer" ? "Khách hàng" : "Nhân viên"}
                </Button>
              ))}
            </div>
            <Input
              autoFocus
              aria-label={mode === "customer" ? "Tìm khách hàng" : "Tìm nhân viên"}
              placeholder={mode === "customer" ? "Tìm hoặc nhập tên khách hàng" : "Tìm tên hoặc mã nhân viên"}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <ul className="mt-2 max-h-56 overflow-y-auto">
              {options?.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => pick(option)}
                  >
                    <span className="block truncate">{option.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.code}
                      {option.detail && ` · ${option.detail}`}
                    </span>
                  </button>
                </li>
              ))}
              {options?.length === 0 && (
                <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                  {mode === "customer" ? "Không tìm thấy khách hàng" : "Không tìm thấy nhân viên đang làm việc"}
                </li>
              )}
            </ul>
            {canCreate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 w-full justify-start text-primary"
                onClick={() => setCreating(true)}
              >
                <Plus aria-hidden />
                <span className="truncate">
                  {typed ? `Thêm khách hàng “${typed}”` : "Thêm khách hàng mới"}
                </span>
              </Button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
