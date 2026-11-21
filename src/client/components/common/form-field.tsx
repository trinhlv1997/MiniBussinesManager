import { useId, type ComponentProps } from "react";
import type { FieldError } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormFieldProps = ComponentProps<typeof Input> & {
  label: string;
  error?: FieldError;
  hint?: string;
};

export function FormField({ label, error, hint, ...inputProps }: FormFieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const description = error?.message ?? hint;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={description ? descriptionId : undefined}
        {...inputProps}
      />
      {description && (
        <p
          id={descriptionId}
          className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {description}
        </p>
      )}
    </div>
  );
}
