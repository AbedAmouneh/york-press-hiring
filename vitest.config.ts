import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Tests must never reach the real providers, even if a developer's shell has keys set.
    env: { ANTHROPIC_API_KEY: "", PDL_API_KEY: "", SIGNALHIRE_API_KEY: "", RESEND_API_KEY: "", DATABASE_URL: "", APP_URL: "" },
  },
});
