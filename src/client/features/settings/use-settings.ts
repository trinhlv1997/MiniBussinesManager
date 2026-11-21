import { useQuery } from "@tanstack/react-query";
import type { CompanySettings } from "@shared/types";
import { apiRequest } from "@/lib/api";

export const SETTINGS_KEY = "settings";

export function useSettings() {
  return useQuery({
    queryKey: [SETTINGS_KEY],
    queryFn: () => apiRequest<CompanySettings>("/settings"),
    staleTime: 10 * 60 * 1000,
  });
}
