import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { requireAuth, type AppEnv } from "./auth.js";
import { env, missingProductionSecrets } from "./env.js";
import { captureError } from "./monitoring.js";
import { publicRoutes } from "./routes/public.js";
import { requestRoutes } from "./routes/requests.js";
import { candidateRoutes } from "./routes/candidates.js";
import { outreachRoutes } from "./routes/outreach.js";
import { adminRoutes } from "./routes/admin.js";
import { positionRoutes } from "./routes/positions.js";
import { locationRoutes } from "./routes/locations.js";
import { universityRoutes } from "./routes/universities.js";
import { apiHeaders, noStore, sameOrigin } from "./security.js";

// AppEnv so the error handler can read the signed-in user (unset on public routes).
const app = new Hono<AppEnv>().basePath("/api");

app.use("*", apiHeaders, noStore, sameOrigin);

// Production never runs on the development secrets that are public in this repo: it answers 503 until they're set.
app.use("*", async (c, next) => {
  const missing = missingProductionSecrets();
  if (missing.length) {
    console.error(`Missing production secrets: ${missing.join(", ")}. Set them in Vercel and redeploy.`);
    return c.json({ error: "The server isn't fully configured yet. Please try again later." }, 503);
  }
  return next();
});

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
  .route("/", adminRoutes)
  .route("/", positionRoutes)
  .route("/", locationRoutes)
  .route("/", universityRoutes);

// Public routes first: their handlers answer before the sign-in check on `authed` runs.
export const routes = app.route("/", publicRoutes).route("/", authed);

app.notFound((c) => c.json({ error: "Not found." }, 404));

/** Every API route with its input and output types, used by the typed browser client in src/lib/rpc.ts. */
export type AppType = typeof routes;

export default app;
