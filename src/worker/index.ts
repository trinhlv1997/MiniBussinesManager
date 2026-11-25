import { createDb } from "../db/client";
import { app } from "./app";
import type { Bindings } from "./env";
import { runMaintenance } from "./services/maintenance";
import { BASE_PATH } from "@shared/base-path";

/** /management/api/* → /api/*: trình duyệt gọi API dưới tiền tố, còn Hono (và test) vẫn dùng /api. */
function stripBasePath(request: Request): Request {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${BASE_PATH}/api/`)) return request;
  url.pathname = url.pathname.slice(BASE_PATH.length);
  return new Request(url, request);
}

export default {
  fetch: (request, env, ctx) => app.fetch(stripBasePath(request), env, ctx),
  /** Cron Trigger (wrangler.jsonc → triggers.crons): dọn nhật ký cũ hơn 30 ngày và dữ liệu đăng nhập hết hạn. */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runMaintenance(createDb(env.DB)).then((result) => console.log("Dọn dẹp hằng đêm", result)),
    );
  },
} satisfies ExportedHandler<Bindings>;
