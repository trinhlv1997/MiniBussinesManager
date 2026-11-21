import { useState } from "react";

type DialogState<T> =
  | { mode: "create"; row?: undefined }
  | { mode: "view" | "edit" | "delete"; row: T }
  | null;

/** Which dialog of a list page is open, and for which row. */
export function useEntityDialog<T>() {
  const [state, setState] = useState<DialogState<T>>(null);
  return {
    mode: state?.mode,
    row: state?.row,
    create: () => setState({ mode: "create" }),
    view: (row: T) => setState({ mode: "view", row }),
    edit: (row: T) => setState({ mode: "edit", row }),
    remove: (row: T) => setState({ mode: "delete", row }),
    close: () => setState(null),
  };
}
