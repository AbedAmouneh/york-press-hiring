import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { allowedOrigins, sameOrigin } from "../../server/security.js";

function app() {
  const a = new Hono().basePath("/api");
  a.use("*", sameOrigin);
  a.onError((err, c) => c.json({ error: err.message }, err instanceof HTTPException ? err.status : 500));
  a.all("*", (c) => c.json({ ok: true }));
  return a;
}
const post = (path: string, headers: Record<string, string> = {}) => app().request(`/api${path}`, { method: "POST", headers });

describe("sameOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets same-origin and header-less requests through", async () => {
    vi.stubEnv("APP_URL", "https://hire.york-press.com");
    expect((await post("/auth/login", { origin: "https://hire.york-press.com", "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect((await post("/auth/login")).status).toBe(200);
  });

  it("blocks another site's origin", async () => {
    vi.stubEnv("APP_URL", "https://hire.york-press.com");
    expect((await post("/auth/login", { origin: "https://evil.example" })).status).toBe(403);
  });

  it("blocks requests the browser marks as cross-site", async () => {
    expect((await post("/requests", { "sec-fetch-site": "cross-site" })).status).toBe(403);
  });

  it("never blocks reads", async () => {
    const res = await app().request("/api/requests", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(200);
  });

  it("leaves server-to-server endpoints to their own secrets", async () => {
    expect((await post("/webhooks/signalhire/x", { origin: "https://www.signalhire.com" })).status).toBe(200);
    expect((await post("/internal/runs/1/continue", { "sec-fetch-site": "cross-site" })).status).toBe(200);
  });

  it("allows localhost on any port during development only", async () => {
    expect((await post("/auth/login", { origin: "http://localhost:5174" })).status).toBe(200);
    vi.stubEnv("NODE_ENV", "production");
    expect((await post("/auth/login", { origin: "http://localhost:5174" })).status).toBe(403);
  });

  it("accepts Vercel preview URLs", () => {
    vi.stubEnv("VERCEL_URL", "york-press-hiring-abc123.vercel.app");
    expect(allowedOrigins().has("https://york-press-hiring-abc123.vercel.app")).toBe(true);
  });
});
