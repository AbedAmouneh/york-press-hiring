// Job queue for sourcing runs, using Upstash QStash. QStash calls our endpoint, retries with backoff
// when a call fails or times out, and signs every call so nobody else can trigger runs.
// Without QSTASH_TOKEN (or without a public https APP_URL) the pipeline falls back to running in the
// background of the current request, as before.
import { Client, Receiver } from "@upstash/qstash";
import { appIsPublic, env } from "../env.js";

export const QUEUE_PATH = "/api/internal/queue/runs";
const RETRIES = 3;

export const queueEnabled = () => !!env.qstashToken && appIsPublic();
const queueUrl = () => `${env.appUrl}${QUEUE_PATH}`;

/** Queue a sourcing run (or the next slice of one). Returns false when the queue isn't configured. */
export async function enqueueRun(runId: string, opts: { delaySeconds?: number } = {}): Promise<boolean> {
  if (!queueEnabled()) return false;
  const client = new Client({ token: env.qstashToken });
  await client.publishJSON({
    url: queueUrl(),
    body: { runId },
    retries: RETRIES,
    ...(opts.delaySeconds ? { delay: opts.delaySeconds } : {}),
  });
  return true;
}

/** True only for a request QStash signed for exactly our queue URL. */
export async function verifyQueueRequest(signature: string | undefined, body: string): Promise<boolean> {
  if (!signature || !env.qstashCurrentSigningKey || !env.qstashNextSigningKey) return false;
  const receiver = new Receiver({ currentSigningKey: env.qstashCurrentSigningKey, nextSigningKey: env.qstashNextSigningKey });
  try {
    return await receiver.verify({ signature, body, url: queueUrl(), clockTolerance: 5 });
  } catch {
    return false;
  }
}
