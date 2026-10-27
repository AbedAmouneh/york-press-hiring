import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "node:path";

const release = process.env.VERCEL_GIT_COMMIT_SHA;
// Upload source maps to Sentry only when the build has a token (set in Vercel), then delete them
// so they are never served publicly.
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN && !!process.env.SENTRY_ORG && !!process.env.SENTRY_PROJECT;

const plugins: PluginOption[] = [react(), tailwindcss()];
if (uploadSourceMaps) {
  plugins.push(sentryVitePlugin({
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: release ? { name: release } : undefined,
    sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
    telemetry: false,
  }));
}

export default defineConfig({
  plugins,
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  define: release ? { "import.meta.env.VITE_RELEASE": JSON.stringify(release) } : {},
  build: {
    sourcemap: uploadSourceMaps ? "hidden" : false,
  },
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3001}` },
  },
});
