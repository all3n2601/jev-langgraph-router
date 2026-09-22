import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "jev-router-core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "jev-ai-sdk-router": fileURLToPath(
        new URL("./packages/ai-sdk/src/index.ts", import.meta.url),
      ),
      "jev-typesafe-router": fileURLToPath(
        new URL("./packages/typesafe/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: [
        "packages/core/src/**/*.ts",
        "packages/ai-sdk/src/**/*.ts",
        "packages/typesafe/src/**/*.ts",
        "packages/langgraph/src/**/*.ts",
      ],
      exclude: ["**/dist/**"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
