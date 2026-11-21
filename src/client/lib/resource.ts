import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { Paginated } from "@shared/api";
import { apiRequest } from "./api";

export type QueryParams = Record<string, string | number | undefined>;

export function toQueryString(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Totals on the dashboard and reports depend on every module. */
export function refreshAfterChange(client: QueryClient, ...keys: string[]) {
  for (const key of [...keys, "dashboard", "reports"]) {
    void client.invalidateQueries({ queryKey: [key] });
  }
}

export function useResourceList<T>(key: string, path: string, params: QueryParams) {
  return useQuery({
    queryKey: [key, "list", path, params],
    queryFn: () => apiRequest<Paginated<T>>(`${path}${toQueryString(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useResourceDetail<T>(key: string, path: string, id: number | null | undefined) {
  return useQuery({
    queryKey: [key, "detail", id],
    queryFn: () => apiRequest<T>(`${path}/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveResource<R = unknown>(key: string, path: string, related: string[] = []) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: unknown }) =>
      apiRequest<R>(id ? `${path}/${id}` : path, { method: id ? "PUT" : "POST", body }),
    onSuccess: () => refreshAfterChange(client, key, ...related),
  });
}

export function useDeleteResource(key: string, path: string, related: string[] = []) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest<null>(`${path}/${id}`, { method: "DELETE" }),
    onSuccess: () => refreshAfterChange(client, key, ...related),
  });
}
