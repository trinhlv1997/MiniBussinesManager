import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "@/app/router";
import { Toaster } from "@/components/ui/sonner";
import { SESSION_KEY } from "@/features/auth/use-auth";
import { ApiClientError } from "@/lib/api";
import "./index.css";

// An expired session anywhere sends the user back to the login page.
function handleExpiredSession(error: Error) {
  if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
    queryClient.setQueryData(SESSION_KEY, null);
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleExpiredSession }),
  mutationCache: new MutationCache({ onError: handleExpiredSession }),
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        failureCount < 1 && (!(error instanceof ApiClientError) || error.status >= 500),
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
