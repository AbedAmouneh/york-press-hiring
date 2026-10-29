import { defineConfig, devices } from "@playwright/test";

// Browser tests run against the real dev servers on a throwaway database seeded with demo data (mock mode).
const PORT = 5174;
const API_PORT = 3002;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -rf .data/e2e && npm run seed:demo && concurrently -k "tsx server/dev.ts" "vite --port ${PORT} --strictPort"`,
    url: `http://localhost:${PORT}/api/setup`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      NODE_ENV: "development",
      PGLITE_DIR: ".data/e2e",
      API_PORT: String(API_PORT),
      DEMO_MODE: "true",
      // Exercise the strictest setup: two-step login required for the admin.
      REQUIRE_TWO_FACTOR: "true",
      APP_URL: `http://localhost:${PORT}`,
      // Empty values win over .env, so the tests always run in mock mode.
      DATABASE_URL: "",
      ANTHROPIC_API_KEY: "",
      OPENCODE_API_KEY: "",
      GEMINI_API_KEY: "",
      PDL_API_KEY: "",
      SIGNALHIRE_API_KEY: "",
      RESEND_API_KEY: "",
    },
  },
});
