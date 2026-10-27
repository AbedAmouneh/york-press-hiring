import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { requireAuth, type AppEnv } from "./auth.js";
import { env } from "./env.js";
import { captureError } from "./monitoring.js";
import { publicRoutes } from "./routes/public.js";
import { requestRoutes } from "./routes/requests.js";
import { candidateRoutes } from "./routes/candidates.js";
import { outreachRoutes } from "./routes/outreach.js";
import { adminRoutes } from "./routes/admin.js";
import { apiHeaders, noStore, sameOrigin } from "./security.js";

// AppEnv so the error handler can read the signed-in user (unset on public routes).
const app = new Hono<AppEnv>().basePath("/api");

app.use("*", apiHeaders, noStore, sameOrigin);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return c.json({ error: `${first.path.join(".") || "Input"}: ${first.message}` }, 400);
  }
  console.error(err);
  captureError(err, { tags: { route: c.req.routePath, method: c.req.method }, userId: c.var.user?.id });
  // Internal messages can name tables, providers or keys; only show them during development.
  return c.json({ error: !env.isProd && err instanceof Error ? err.message : "Something went wrong. Please try again." }, 500);
});

const authed = new Hono<AppEnv>()
  .use("*", requireAuth)
  .route("/", requestRoutes)
  .route("/", candidateRoutes)
  .route("/", outreachRoutes)
  .route("/", adminRoutes);

// Public routes first: their handlers answer before the sign-in check on `authed` runs.
export const routes = app.route("/", publicRoutes).route("/", authed);

app.notFound((c) => c.json({ error: "Not found." }, 404));

/** Every API route with its input and output types, used by the typed browser client in src/lib/rpc.ts. */
export type AppType = typeof routes;

export default app;
