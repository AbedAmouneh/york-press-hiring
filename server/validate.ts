// Request validators that feed Hono's RPC types: the browser client gets the exact input types,
// and a failed check throws the ZodError so app.onError answers with the usual { error } message.
import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

const rethrow = (result: { success: boolean; error?: unknown }) => {
  if (!result.success) throw result.error;
};

export const json = <S extends ZodType>(schema: S) => zValidator("json", schema, rethrow);
export const query = <S extends ZodType>(schema: S) => zValidator("query", schema, rethrow);
export const form = <S extends ZodType>(schema: S) => zValidator("form", schema, rethrow);
