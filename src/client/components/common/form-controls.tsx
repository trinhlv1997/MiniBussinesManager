import { ImagePlus, X } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldError,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { toast } from "sonner";
import { formatNumber } from "@shared/format";
import { DatePicker } from "@/components/common/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { imageToSmallDataUrl } from "@/lib/image";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: { message?: string };
  hint?: string;
  children: (props: { id: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const description = error?.message ?? hint;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, invalid: Boolean(error) })}
      {description && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {description}
        </p>
      )}
    </div>
  );
}

export function TextareaField({
  label,
  error,
  ...props
}: ComponentProps<typeof Textarea> & { label: string; error?: FieldError }) {
  return (
    <Field label={label} error={error}>
      {({ id, invalid }) => <Textarea id={id} aria-invalid={invalid} rows={3} {...props} />}
    </Field>
  );
}

type ControlledProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
};

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  options,
  placeholder = "Chọn",
}: ControlledProps<T> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} hint={hint} error={fieldState.error}>
          {({ id, invalid }) => (
            <Select value={field.value ? String(field.value) : ""} onValueChange={field.onChange}>
              <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
    />
  );
}

export function DateField<T extends FieldValues>({ control, name, label, hint }: ControlledProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} hint={hint} error={fieldState.error}>
          {({ id, invalid }) => (
            <DatePicker id={id} invalid={invalid} value={field.value ?? ""} onChange={field.onChange} />
          )}
        </Field>
      )}
    />
  );
}

function parseWhole(text: string, allowNegative: boolean): number | undefined {
  const digits = text.replace(/\D/g, "");
  if (!digits) return undefined;
  const value = Number(digits);
  return allowNegative && text.trim().startsWith("-") ? -value : value;
}

export function NumberInput({
  value,
  onChange,
  allowNegative = false,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number | null | undefined;
  onChange: (value: number | undefined) => void;
  allowNegative?: boolean;
}) {
  const text =
    value === null || value === undefined
      ? ""
      : `${value < 0 ? "-" : ""}${formatNumber(Math.abs(value))}`;
  return (
    <Input
      inputMode={allowNegative ? "text" : "numeric"}
      autoComplete="off"
      className="tabular-nums"
      value={text}
      onChange={(event) => onChange(parseWhole(event.target.value, allowNegative))}
      {...props}
    />
  );
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  placeholder,
}: ControlledProps<T> & { placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} hint={hint} error={fieldState.error}>
          {({ id, invalid }) => (
            <NumberInput
              id={id}
              aria-invalid={invalid}
              placeholder={placeholder}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        </Field>
      )}
    />
  );
}

export function ImageField<T extends FieldValues>({ control, name, label }: ControlledProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} error={fieldState.error} hint="PNG, JPG hoặc WebP. Ảnh được tự thu nhỏ.">
          {({ id }) => (
            <div className="flex items-center gap-3">
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                {field.value ? (
                  <img src={field.value} alt="" className="size-full object-cover" />
                ) : (
                  <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
                )}
              </span>
              <Input
                id={id}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="min-w-0"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  imageToSmallDataUrl(file).then(field.onChange, (error: Error) =>
                    toast.error(error.message),
                  );
                }}
              />
              {field.value && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Bỏ ảnh"
                  onClick={() => field.onChange("")}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
          )}
        </Field>
      )}
    />
  );
}
