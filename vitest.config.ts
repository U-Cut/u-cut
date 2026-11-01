import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/site/src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/*.int.test.ts", "**/node_modules/**"],
  },
});
