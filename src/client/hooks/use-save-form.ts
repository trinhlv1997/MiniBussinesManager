import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import type { FieldValues, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { applyServerErrors } from "@/lib/form-errors";

type SaveMutation = UseMutationResult<unknown, Error, { id?: number; body: unknown }>;

/** Shared submit behaviour: server errors land on fields, success closes the dialog. */
export function useSaveForm<T extends FieldValues>({
  mutation,
  id,
  setError,
  successMessage,
  onDone,
}: {
  mutation: SaveMutation;
  id?: number;
  setError: UseFormSetError<T>;
  successMessage: string;
  onDone: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const save = (body: unknown) => {
    setFormError(null);
    mutation.mutate(
      { id, body },
      {
        onSuccess: () => {
          toast.success(successMessage);
          onDone();
        },
        onError: (error) => setFormError(applyServerErrors(error, setError)),
      },
    );
  };
  return { save, formError, pending: mutation.isPending };
}
