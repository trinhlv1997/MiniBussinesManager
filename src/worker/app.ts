import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ApiFailure } from "@shared/api";
import type { AppEnv } from "./env";
import { ApiError } from "./lib/errors";
import { ok } from "./lib/http";
import { canManageCatalog, type Module } from "@shared/permissions";
import { apiHeaders, requireAdmin, requireModule, requireSameOrigin } from "./middleware/security";
import { auditRoutes, userNameRoutes, userRoutes } from "./routes/admin";
import { dashboardRoutes, reportRoutes } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { inventoryRoutes } from "./routes/inventory";
import { taskRoutes, teamRoutes } from "./routes/tasks";
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

/** Mỗi nhóm API chỉ mở cho vai trò được phép dùng chức năng đó (shared/permissions.ts). */
const guarded = (module: Module, routes: Hono<AppEnv>) =>
  new Hono<AppEnv>().use("*", requireModule(module)).route("/", routes);

/** Thông tin công ty: ai đăng nhập cũng đọc được (tên app, in phiếu PDF), chỉ Admin được sửa. */
const settingsGuard = new Hono<AppEnv>()
  .use("*", async (c, next) => (c.req.method === "GET" ? next() : requireModule("settings")(c, next)))
  .route("/", settingsRoutes);

/** Sản phẩm, Danh mục: ai có module "products" cũng xem được; chỉ Quản trị / Quản lý được thêm, sửa, xoá. */
const catalogGuard = (routes: Hono<AppEnv>) =>
  new Hono<AppEnv>()
    .use("*", requireModule("products"))
    .use("*", async (c, next) => {
      if (c.req.method !== "GET" && !canManageCatalog(c.get("admin").role)) {
        throw new ApiError(403, "FORBIDDEN", "Nhân viên chỉ được xem sản phẩm và danh mục");
      }
      await next();
    })
    .route("/", routes);

app.get("/health", (c) => ok(c, { status: "ok" }));
app.route("/auth", authRoutes);
app.route("/user-names", userNameRoutes);
app.route("/tasks", guarded("tasks", taskRoutes));
app.route("/teams", guarded("teams", teamRoutes));
app.route("/employees", guarded("employees", employeeRoutes));
app.route("/customers", guarded("customers", customerRoutes));
app.route("/products", catalogGuard(productRoutes));
app.route("/product-categories", catalogGuard(categoryRoutes));
app.route("/inventory", guarded("inventory", inventoryRoutes));
app.route("/dashboard", guarded("dashboard", dashboardRoutes));
app.route("/reports", guarded("reports", reportRoutes));
app.route("/settings", settingsGuard);
app.route("/users", guarded("users", userRoutes));
app.route("/audit-logs", guarded("audit", auditRoutes));

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
