import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const scope = { setTags: vi.fn(), setExtras: vi.fn(), setUser: vi.fn() };
  return {
    scope,
    init: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn(async () => true),
    withScope: vi.fn((fn: (s: typeof scope) => void) => fn(scope)),
  };
});
vi.mock("@sentry/node", () => sentry);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("server error monitoring", () => {
  it("does nothing without a DSN", async () => {
    const { captureError } = await import("../../server/monitoring.js");
    await captureError(new Error("boom"));
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports with tags, ids and a flush when a DSN is set", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
    const { captureError } = await import("../../server/monitoring.js");
    const err = new Error("boom");
    await captureError(err, { tags: { area: "pipeline" }, extra: { runId: "r1" }, userId: "u1" });
    expect(sentry.init).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledWith(err);
    expect(sentry.scope.setTags).toHaveBeenCalledWith({ area: "pipeline" });
    expect(sentry.scope.setUser).toHaveBeenCalledWith({ id: "u1" });
    expect(sentry.flush).toHaveBeenCalled();
  });

  it("strips request bodies, cookies and headers before sending", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
    const { captureError } = await import("../../server/monitoring.js");
    await captureError(new Error("boom"));
    const { beforeSend, dataCollection } = sentry.init.mock.calls[0][0];
    expect(dataCollection).toMatchObject({ cookies: false, httpBodies: [], stackFrameVariables: false, databaseQueryData: false });
    const event = beforeSend({ request: { url: "/api/x", data: "{cv}", cookies: { yp_session: "t" }, headers: { cookie: "t" }, query_string: "q" } });
    expect(event.request).toEqual({ url: "/api/x" });
  });
});
