import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ApiFailure } from "@shared/api";
import type { AppEnv } from "./env";
import { ApiError } from "./lib/errors";
import { ok } from "./lib/http";
import { apiHeaders, requireAdmin, requireSameOrigin } from "./middleware/security";
import { dashboardRoutes, reportRoutes } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { inventoryRoutes } from "./routes/inventory";
import {
  categoryRoutes,
  customerRoutes,
  employeeRoutes,
  productRoutes,
  settingsRoutes,
} from "./routes/modules";

const MAX_BODY_BYTES = 512 * 1024;

export const app = new Hono<AppEnv>().basePath("/api");

app.use("*", apiHeaders, requireSameOrigin);
app.use(
  "*",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn");
    },
  }),
);
app.use("*", requireAdmin);

app.get("/health", (c) => ok(c, { status: "ok" }));
app.route("/auth", authRoutes);
app.route("/employees", employeeRoutes);
app.route("/customers", customerRoutes);
app.route("/products", productRoutes);
app.route("/product-categories", categoryRoutes);
app.route("/inventory", inventoryRoutes);
app.route("/dashboard", dashboardRoutes);
app.route("/reports", reportRoutes);
app.route("/settings", settingsRoutes);

app.notFound((c) =>
  c.json<ApiFailure>(
    { success: false, error: { code: "NOT_FOUND", message: "Không tìm thấy tài nguyên" } },
    404,
  ),
);

app.onError((error, c) => {
  if (error instanceof ApiError) {
    if (error.retryAfterSeconds) c.header("Retry-After", String(error.retryAfterSeconds));
    return c.json<ApiFailure>(
      {
        success: false,
        error: { code: error.code, message: error.message, fields: error.fields },
      },
      error.status,
    );
  }

  console.error("Unhandled API error", error);
  return c.json<ApiFailure>(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Hệ thống gặp lỗi. Vui lòng thử lại sau." },
    },
    500,
  );
});
