import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        assets: undefined,
        bindings: {
          APP_ENV: "development",
          PASSWORD_PEPPER: "test-only-pepper-not-used-anywhere-else",
          TEST_MIGRATIONS: await readD1Migrations(path("./migrations")),
        },
      },
    }),
  ],
  resolve: { alias: { "@shared": path("./src/shared") } },
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["./tests/setup.ts"] },
}));
