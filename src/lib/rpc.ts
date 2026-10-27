// Typed API client. Paths, inputs and responses come straight from the server routes (Hono RPC),
// so a renamed field or a changed rule is a type error here instead of a bug in the browser.
import { hc, type ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";
import type { AppType } from "../../server/app";
import { ApiError } from "./api";

export const rpc = hc<AppType>("/", { init: { credentials: "same-origin" } }).api;

/** The JSON body of a successful response, from a typed call. */
export type Ok<R> = R extends ClientResponse<infer T, infer S, infer _F> ? (S extends SuccessStatusCode ? T : never) : never;

/** Await a typed call: returns the success body, or throws ApiError with the server's message. */
export async function call<R extends ClientResponse<unknown>>(request: Promise<R>): Promise<Ok<R>> {
  const res = await request;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as Ok<R>;
}
