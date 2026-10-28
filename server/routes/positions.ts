import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { json } from "../validate.js";
import { hasRole, requireRole, type AppEnv } from "../auth.js";
import { PositionInput, PositionPatch } from "../../shared/schemas.js";

const t = schema.positions;

/** Saved positions with suggested details. Everyone signed in can read them; recruiters and admins keep the list. */
export const positionRoutes = new Hono<AppEnv>()
  .get("/positions", async (c) => {
    const user = c.get("user");
    const db = await getDb();
    const all = hasRole(user, "recruiter", "admin");
    const rows = await db.select().from(t).where(all ? undefined : eq(t.active, true)).orderBy(asc(t.department), asc(t.title));
    return c.json({ positions: rows });
  })
  .post("/positions", json(PositionInput), async (c) => {
    requireRole(c, "recruiter", "admin");
    const body = c.req.valid("json");
    const db = await getDb();
    await assertUniqueTitle(body.title);
    const [p] = await db.insert(t).values(body).returning();
    return c.json({ position: p });
  })
  .patch("/positions/:id", json(PositionPatch), async (c) => {
    requireRole(c, "recruiter", "admin");
    const body = c.req.valid("json");
    const db = await getDb();
    const [current] = await db.select().from(t).where(eq(t.id, c.req.param("id")));
    if (!current) throw new HTTPException(404, { message: "Position not found." });
    PositionInput.parse({ ...current, ...body }); // the merged position must still be valid (years rule)
    if (body.title) await assertUniqueTitle(body.title, current.id);
    const [p] = await db.update(t).set({ ...body, updatedAt: new Date() }).where(eq(t.id, current.id)).returning();
    return c.json({ position: p });
  })
  .delete("/positions/:id", async (c) => {
    requireRole(c, "recruiter", "admin");
    const db = await getDb();
    const [p] = await db.delete(t).where(eq(t.id, c.req.param("id"))).returning({ id: t.id });
    if (!p) throw new HTTPException(404, { message: "Position not found." });
    return c.json({ ok: true });
  });

async function assertUniqueTitle(title: string, exceptId?: string) {
  const db = await getDb();
  const [dupe] = await db.select({ id: t.id }).from(t).where(sql`lower(${t.title}) = lower(${title.trim()})`);
  if (dupe && dupe.id !== exceptId) throw new HTTPException(409, { message: `"${title.trim()}" is already in the list.` });
}
