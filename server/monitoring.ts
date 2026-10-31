// Error monitoring with Sentry. Does nothing unless SENTRY_DSN is set.
// Candidate data never leaves through here: request bodies, cookies and headers are stripped,
// and callers pass only ids and step names as context.
import { waitUntil } from "@vercel/functions";
import { env, redactSecrets } from "./env.js";

type SentryModule = typeof import("@sentry/node");
let sentry: Promise<SentryModule | null> | null = null;

function load(): Promise<SentryModule | null> {
  if (!env.sentryDsn) return Promise.resolve(null);
  sentry ??= import("@sentry/node").then((S) => {
    S.init({
      dsn: env.sentryDsn,
      environment: env.vercelEnv || (env.isProd ? "production" : "development"),
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      // Collect nothing beyond the error itself: local variables and query data can hold candidate details.
      dataCollection: {
        userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
        stackFrameVariables: false, databaseQueryData: false, genAI: { inputs: false, outputs: false },
      },
      beforeSend(event) {
        // Provider errors can echo an API key; strip secrets from messages and exception text.
        if (event.message) event.message = redactSecrets(event.message);
        for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = redactSecrets(ex.value);
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          delete event.request.headers;
          delete event.request.query_string;
        }
        return event;
      },
    });
    return S;
  }).catch((e) => {
    console.error("sentry init", e);
    return null;
  });
  return sentry;
}

export type ErrorContext = { tags?: Record<string, string>; extra?: Record<string, string | number | boolean | null>; userId?: string };

/** Report an unexpected error. Safe to call anywhere; never throws. */
export function captureError(err: unknown, ctx: ErrorContext = {}) {
  const work = load().then(async (S) => {
    if (!S) return;
    S.withScope((scope) => {
      if (ctx.tags) scope.setTags(ctx.tags);
      if (ctx.extra) scope.setExtras(ctx.extra);
      if (ctx.userId) scope.setUser({ id: ctx.userId });
      S.captureException(err);
    });
    // Serverless functions freeze after the response; send the event before that.
    await S.flush(2000);
  }).catch(() => undefined);
  if (env.onVercel) waitUntil(work);
  return work;
}
