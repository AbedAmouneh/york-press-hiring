// Request-level protections: same-origin check for state-changing requests (CSRF) and security headers.
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Called by other servers (SignalHire, Vercel cron, our own pipeline), never by a browser; they carry their own secrets. */
const MACHINE_PATHS = /^\/api\/(webhooks|cron|internal)\//;

/** Origins allowed to send state-changing requests with the session cookie. */
export function allowedOrigins() {
  const origins = new Set([new URL(env.appUrl).origin]);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) origins.add(`https://${host}`);
  }
  return origins;
}

const isLocal = (origin: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

/**
 * CSRF protection. Browsers always send Origin on cross-site POSTs and Sec-Fetch-Site on all modern
 * requests, so a request from another site is rejected before it reaches a route. The session cookie
 * is also SameSite=Lax, which is the second layer.
 */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || MACHINE_PATHS.test(c.req.path)) return next();
  const site = c.req.header("sec-fetch-site");
  if (site === "cross-site") throw new HTTPException(403, { message: "Cross-site request blocked." });
  const origin = c.req.header("origin");
  if (origin && !allowedOrigins().has(origin) && !(isLocal(origin) && !env.isProd)) {
    throw new HTTPException(403, { message: "Cross-site request blocked." });
  }
  return next();
};

/** Headers for API responses. Page headers (including the CSP) are set in vercel.json. */
export const apiHeaders = secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  strictTransportSecurity: "max-age=63072000; includeSubDomains",
  xFrameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  crossOriginResourcePolicy: "same-origin",
  permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
});

/** API responses carry personal data: never let a shared cache keep them. */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  if (!c.res.headers.has("cache-control")) c.res.headers.set("cache-control", "no-store");
};
