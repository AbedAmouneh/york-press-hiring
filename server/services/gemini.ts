// Google Gemini as the AI behind briefs, scoring, personal lines and CV scoring (GEMINI_API_KEY).
// Same prompts and JSON schemas as the Claude path; Gemini returns the JSON directly (structured output).
import { env } from "../env.js";

const GEMINI_TIMEOUT_MS = 60_000;

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type GeminiCall = {
  system: string;
  parts: GeminiPart[];
  schema: Record<string, unknown>;
  maxTokens?: number;
};

export type GeminiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/** The generateContent request body. Exported for tests. */
export function geminiBody(call: GeminiCall) {
  return {
    systemInstruction: { parts: [{ text: call.system }] },
    contents: [{ role: "user", parts: call.parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: call.schema,
      // Thinking tokens count towards the output limit, so leave room beyond the answer itself.
      maxOutputTokens: Math.max(8192, (call.maxTokens ?? 4000) * 3),
      temperature: 0.2,
      // Screening is a judgement call on given evidence, not a puzzle: low thinking keeps each call fast and cheap.
      thinkingConfig: { thinkingLevel: env.geminiThinking },
    },
  };
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
  error?: { code?: number; message?: string; status?: string };
};

/** Read the JSON answer and token counts from a generateContent response. Exported for tests. */
export function readGemini<T>(res: GeminiResponse): { data: T; usage: GeminiUsage } {
  const u = res.usageMetadata ?? {};
  const usage = {
    inputTokens: u.promptTokenCount ?? 0,
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    cacheReadTokens: u.cachedContentTokenCount ?? 0,
    cacheWriteTokens: 0,
  };
  const cand = res.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  if (!text) {
    const why = res.promptFeedback?.blockReason ?? cand?.finishReason ?? "no answer";
    throw new Error(`Gemini returned no result (${why})`);
  }
  try {
    return { data: JSON.parse(text) as T, usage };
  } catch {
    throw new Error(`Gemini returned invalid JSON (${cand?.finishReason ?? "unknown"})`);
  }
}

/** Models to try in order: the chosen one, then lighter ones that are usually less busy. Exported for tests. */
export function geminiModels(chosen = env.geminiModel) {
  return [...new Set([chosen, ...FALLBACK_MODELS])];
}
const FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
/** Busy or temporarily failing: worth trying again, or trying the next model. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

class GeminiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * Ask Gemini, moving to a lighter model when one is overloaded (503 "high demand", 429 rate limits),
 * with a short pause between tries. Other errors (bad key, bad request) fail straight away.
 */
export async function geminiStructured<T>(call: GeminiCall): Promise<{ data: T; usage: GeminiUsage }> {
  const models = geminiModels();
  let last: Error | null = null;
  for (const [i, model] of models.entries()) {
    try {
      return await geminiOnce<T>(model, call);
    } catch (err) {
      last = err as Error;
      const retryable = err instanceof GeminiError ? RETRYABLE.has(err.status) : /did not answer/.test(last.message);
      if (!retryable || i === models.length - 1) break;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last ?? new Error("Gemini failed");
}

async function geminiOnce<T>(model: string, call: GeminiCall): Promise<{ data: T; usage: GeminiUsage }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiKey },
      body: JSON.stringify(geminiBody(call)),
      // Never let one slow answer hold a whole run: fail clearly so the run can be retried.
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") throw new Error(`Gemini did not answer within ${GEMINI_TIMEOUT_MS / 1000} seconds`);
    throw err;
  }
  const json = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) throw new GeminiError(`Gemini ${res.status} (${model}): ${json.error?.message ?? res.statusText}`, res.status);
  return readGemini<T>(json);
}
