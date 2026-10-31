// Central place for configuration. Every provider runs in mock mode when its key is missing.

const v = (k: string) => (process.env[k] ?? "").trim();

export const env = {
  get databaseUrl() { return v("DATABASE_URL") || v("POSTGRES_URL"); },
  get appUrl() {
    // A pull-request preview links to itself, never to production, even if APP_URL is set for all environments.
    const previewHost = v("VERCEL_ENV") === "preview" ? v("VERCEL_BRANCH_URL") || v("VERCEL_URL") : "";
    if (previewHost) return `https://${previewHost}`;
    return (v("APP_URL") || (v("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${v("VERCEL_PROJECT_PRODUCTION_URL")}` : "http://localhost:5173")).replace(/\/$/, "");
  },
  get sessionSecret() { return v("SESSION_SECRET") || "dev-session-secret"; },
  get internalSecret() { return v("INTERNAL_SECRET") || "dev-internal-secret"; },
  get webhookSecret() { return v("SIGNALHIRE_WEBHOOK_SECRET") || "dev-webhook-secret"; },
  get cronSecret() { return v("CRON_SECRET"); },
  get anthropicKey() { return v("ANTHROPIC_API_KEY"); },
  /** OpenCode Console key (oc_sk_…). When set, Claude is reached through OpenCode instead of Anthropic directly. */
  get opencodeKey() { return v("OPENCODE_API_KEY"); },
  get opencodeBaseUrl() { return (v("OPENCODE_BASE_URL") || "https://opencode.ai/inference/anthropic").replace(/\/$/, ""); },
  /** Google Gemini key. Used for the LinkedIn lookup (Google Search), and for all AI calls when it is the only AI key. */
  get geminiKey() { return v("GEMINI_API_KEY"); },
  get geminiModel() { return v("GEMINI_MODEL") || "gemini-3.8-flash"; },
  /** Gemini thinking level: low by default (fast, cheap), or minimal/medium/high where the model supports it. */
  get geminiThinking() { return v("GEMINI_THINKING").toLowerCase() || "low"; },
  /**
   * Which service answers the AI calls. AI_PROVIDER picks one explicitly (if its key is set);
   * otherwise Anthropic (the only one with half-price batches and web search), then Gemini, then OpenCode.
   */
  get aiProvider(): "gemini" | "opencode" | "anthropic" | null {
    const keys = { gemini: v("GEMINI_API_KEY"), opencode: v("OPENCODE_API_KEY"), anthropic: v("ANTHROPIC_API_KEY") };
    const pick = v("AI_PROVIDER").toLowerCase();
    if (pick in keys && keys[pick as keyof typeof keys]) return pick as keyof typeof keys;
    return keys.anthropic ? "anthropic" : keys.gemini ? "gemini" : keys.opencode ? "opencode" : null;
  },
  get claudeModel() { return v("CLAUDE_MODEL") || "claude-sonnet-5-5"; },
  /** The model answering AI calls, for display and the usage log. */
  get aiModel() { return env.aiProvider === "gemini" ? env.geminiModel : env.claudeModel; },
  get pdlKey() { return v("PDL_API_KEY"); },
  get signalhireKey() { return v("SIGNALHIRE_API_KEY"); },
  get resendKey() { return v("RESEND_API_KEY"); },
  get emailFrom() { return v("EMAIL_FROM") || "York Press Careers <careers@york-press.com>"; },
  get demoMode() { return v("DEMO_MODE").toLowerCase() === "true"; },
  get onVercel() { return !!v("VERCEL"); },
  get vercelEnv() { return v("VERCEL_ENV"); }, // production | preview | development
  get isPreview() { return v("VERCEL_ENV") === "preview"; },
  /** Previews never email candidates or spend paid credits unless this is explicitly turned on. */
  get previewUsesRealServices() { return v("PREVIEW_USE_REAL_SERVICES").toLowerCase() === "true"; },
  /** Off by default: when true, admin and CEO accounts must set up two-step login before using the app. */
  get requireTwoFactor() { return v("REQUIRE_TWO_FACTOR").toLowerCase() === "true"; },
  get sentryDsn() { return v("SENTRY_DSN"); },
  get blobToken() { return v("BLOB_READ_WRITE_TOKEN"); },
  get qstashToken() { return v("QSTASH_TOKEN"); },
  get qstashCurrentSigningKey() { return v("QSTASH_CURRENT_SIGNING_KEY"); },
  get qstashNextSigningKey() { return v("QSTASH_NEXT_SIGNING_KEY"); },
  get isProd() { return v("NODE_ENV") === "production" || !!v("VERCEL"); },
};

/** A pull-request preview is a test copy: it uses sample data and the mock outbox by default. */
const previewSafe = () => env.isPreview && !env.previewUsesRealServices;

export const mock = {
  get claude() { return !env.aiProvider || previewSafe(); },
  /** Gemini's Google Search (LinkedIn lookup) works whenever its key is set, whichever service scores. */
  get gemini() { return !env.geminiKey || previewSafe(); },
  get pdl() { return !env.pdlKey || previewSafe(); },
  get signalhire() { return !env.signalhireKey || previewSafe(); },
  get email() { return !env.resendKey || previewSafe(); },
};

/**
 * Features only Anthropic's own API offers. OpenCode serves the Messages API (with prompt caching) but not
 * Message Batches or the server-side web search tool, and Gemini has neither in this app, so those steps
 * fall back (direct scoring) or are skipped (web search).
 */
export const aiFeatures = {
  get batches() { return env.aiProvider === "anthropic"; },
  get webSearch() { return env.aiProvider === "anthropic"; },
};

/** True when SignalHire can reach our webhook (a public https URL). */
export const appIsPublic = () => env.appUrl.startsWith("https://") && !env.appUrl.includes("localhost");

export const TIMEZONE = "Asia/Beirut";
export const POOL_SIZE = 50;
export const TOP_N = 10;
