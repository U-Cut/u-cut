import { defineConfig } from "vitest/config";

// Integration tests use real FFmpeg and Chrome, so they run one at a time.
export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
  test: {
    include: ["packages/*/src/**/*.int.test.ts"],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    env: { UCUT_SECRETS: "file" },
  },
});
