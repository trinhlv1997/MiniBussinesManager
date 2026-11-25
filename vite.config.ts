import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // File tĩnh nằm dưới /management/assets để cùng tên miền với website bán hàng (src/shared/base-path.ts).
  build: { assetsDir: "management/assets" },
  resolve: {
    alias: {
      "@shared": path("./src/shared"),
      "@": path("./src/client"),
    },
  },
});
