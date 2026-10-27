import { afterEach, describe, expect, it, vi } from "vitest";

const qstash = vi.hoisted(() => {
  const publishJSON = vi.fn(async () => ({ messageId: "m1" }));
  const verify = vi.fn(async () => true);
  return {
    publishJSON,
    verify,
    Client: vi.fn(function Client() { return { publishJSON }; }),
    Receiver: vi.fn(function Receiver() { return { verify }; }),
  };
});
vi.mock("@upstash/qstash", () => qstash);

import { enqueueRun, QUEUE_PATH, queueEnabled, verifyQueueRequest } from "../../server/services/queue.js";

const live = () => {
  vi.stubEnv("QSTASH_TOKEN", "qstash-token");
  vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "sig-current");
  vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "sig-next");
  vi.stubEnv("APP_URL", "https://hire.york-press.com");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("run queue", () => {
  it("is off without a token, so runs fall back to the background", async () => {
    expect(queueEnabled()).toBe(false);
    expect(await enqueueRun("r1")).toBe(false);
    expect(qstash.publishJSON).not.toHaveBeenCalled();
  });

  it("is off for a local APP_URL, which QStash can't reach", async () => {
    vi.stubEnv("QSTASH_TOKEN", "qstash-token");
    vi.stubEnv("APP_URL", "http://localhost:5173");
    expect(queueEnabled()).toBe(false);
  });

  it("is off on pull-request previews, which sit behind Vercel login", async () => {
    live();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "york-press-hiring-abc123.vercel.app");
    expect(queueEnabled()).toBe(false);
  });

  it("publishes the run to our queue endpoint with retries", async () => {
    live();
    expect(await enqueueRun("r1", { delaySeconds: 30 })).toBe(true);
    expect(qstash.publishJSON).toHaveBeenCalledWith({
      url: `https://hire.york-press.com${QUEUE_PATH}`,
      body: { runId: "r1" },
      retries: 3,
      delay: 30,
    });
  });

  it("checks signatures against our exact URL", async () => {
    live();
    expect(await verifyQueueRequest("sig", '{"runId":"r1"}')).toBe(true);
    expect(qstash.verify).toHaveBeenCalledWith(expect.objectContaining({ signature: "sig", body: '{"runId":"r1"}', url: `https://hire.york-press.com${QUEUE_PATH}` }));
  });

  it("rejects missing or invalid signatures", async () => {
    live();
    expect(await verifyQueueRequest(undefined, "{}")).toBe(false);
    qstash.verify.mockRejectedValueOnce(new Error("invalid signature"));
    expect(await verifyQueueRequest("bad", "{}")).toBe(false);
  });

  it("rejects everything when the signing keys aren't set", async () => {
    expect(await verifyQueueRequest("sig", "{}")).toBe(false);
  });
});
