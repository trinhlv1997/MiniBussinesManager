import { createDb } from "../db/client";
import { app } from "./app";
import type { Bindings } from "./env";
import { runMaintenance } from "./services/maintenance";

export default {
  fetch: app.fetch,
  /** Cron Trigger (wrangler.jsonc → triggers.crons): dọn nhật ký cũ hơn 30 ngày và dữ liệu đăng nhập hết hạn. */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runMaintenance(createDb(env.DB)).then((result) => console.log("Dọn dẹp hằng đêm", result)),
    );
  },
} satisfies ExportedHandler<Bindings>;
