import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

export type ParamChanges = Record<string, string | number | undefined>;

/** Keeps list state in the URL, so filters survive reloads and can be shared. */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const update = useCallback(
    (changes: ParamChanges, options: { keepPage?: boolean } = {}) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (!options.keepPage) next.delete("page");
          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === "") next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const values = useMemo(() => Object.fromEntries(searchParams), [searchParams]);
  return { values, get: (key: string) => searchParams.get(key) ?? "", update };
}
