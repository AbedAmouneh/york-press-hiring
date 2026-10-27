// Central place for configuration. Every provider runs in mock mode when its key is missing.

const v = (k: string) => (process.env[k] ?? "").trim();

export const env = {
  get databaseUrl() { return v("DATABASE_URL") || v("POSTGRES_URL"); },
  get appUrl() { return (v("APP_URL") || (v("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${v("VERCEL_PROJECT_PRODUCTION_URL")}` : "http://localhost:5173")).replace(/\/$/, ""); },
  get sessionSecret() { return v("SESSION_SECRET") || "dev-session-secret"; },
  get internalSecret() { return v("INTERNAL_SECRET") || "dev-internal-secret"; },
  get webhookSecret() { return v("SIGNALHIRE_WEBHOOK_SECRET") || "dev-webhook-secret"; },
  get cronSecret() { return v("CRON_SECRET"); },
  get anthropicKey() { return v("ANTHROPIC_API_KEY"); },
  get claudeModel() { return v("CLAUDE_MODEL") || "claude-sonnet-5-5"; },
  get pdlKey() { return v("PDL_API_KEY"); },
  get signalhireKey() { return v("SIGNALHIRE_API_KEY"); },
  get resendKey() { return v("RESEND_API_KEY"); },
  get emailFrom() { return v("EMAIL_FROM") || "York Press Hiring <hiring@york-press.com>"; },
  get demoMode() { return v("DEMO_MODE").toLowerCase() === "true"; },
  get onVercel() { return !!v("VERCEL"); },
  get vercelEnv() { return v("VERCEL_ENV"); }, // production | preview | development
  get sentryDsn() { return v("SENTRY_DSN"); },
  get blobToken() { return v("BLOB_READ_WRITE_TOKEN"); },
  get qstashToken() { return v("QSTASH_TOKEN"); },
  get qstashCurrentSigningKey() { return v("QSTASH_CURRENT_SIGNING_KEY"); },
  get qstashNextSigningKey() { return v("QSTASH_NEXT_SIGNING_KEY"); },
  get isProd() { return v("NODE_ENV") === "production" || !!v("VERCEL"); },
};

export const mock = {
  get claude() { return !env.anthropicKey; },
  get pdl() { return !env.pdlKey; },
  get signalhire() { return !env.signalhireKey; },
  get email() { return !env.resendKey; },
};

/** True when SignalHire can reach our webhook (a public https URL). */
export const appIsPublic = () => env.appUrl.startsWith("https://") && !env.appUrl.includes("localhost");

export const TIMEZONE = "Asia/Beirut";
export const POOL_SIZE = 50;
export const TOP_N = 10;
