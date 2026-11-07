import { z } from "zod";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Cursor paging for lists that grow forever (outreach, outbox, notifications). Newest first; the cursor is the
 * last row's time and id, so rows added while someone pages don't shift or repeat what they see.
 */
export const PageQuery = {
  /** The `next` value from the previous page. */
  before: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
};

export const DEFAULT_PAGE = 50;

type Cursor = { at: string; id: string };

export function encodeCursor(at: Date, id: string) {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  const [at, id] = Buffer.from(value, "base64url").toString().split("|");
  if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { at, id };
}

// Postgres keeps microseconds, a JavaScript date only milliseconds: compare and sort at millisecond precision so
// the cursor round-trips exactly.
const ms = (col: AnyColumn) => sql`date_trunc('milliseconds', ${col})`;

/** Rows older than the cursor (or every row on the first page). */
export function olderThan(timeCol: AnyColumn, idCol: AnyColumn, cursor: Cursor | null): SQL | undefined {
  return cursor ? sql`(${ms(timeCol)}, ${idCol}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined;
}

/** Newest first, the same order the cursor compares in. */
export function newestFirst(timeCol: AnyColumn, idCol: AnyColumn): SQL[] {
  return [sql`${ms(timeCol)} desc`, sql`${idCol} desc`];
}

/** Query `limit + 1` rows, then pass them here: the extra row only says whether there is another page. */
export function pageOf<T>(rows: T[], limit: number, key: (row: T) => { at: Date; id: string }) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, next: rows.length > limit && last ? encodeCursor(key(last).at, key(last).id) : null };
}
