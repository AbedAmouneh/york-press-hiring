import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { json } from "../validate.js";
import { hasRole, requireRole, type AppEnv } from "../auth.js";
import { LocationInput, LocationPatch } from "../../shared/schemas.js";

const t = schema.locations;

/** Hiring locations. Everyone signed in can read them; recruiters and admins keep the list. */
export const locationRoutes = new Hono<AppEnv>()
  .get("/locations", async (c) => {
    const db = await getDb();
    const all = hasRole(c.get("user"), "recruiter", "admin");
    const rows = await db.select().from(t).where(all ? undefined : eq(t.active, true)).orderBy(asc(t.country), asc(t.name));
    return c.json({ locations: rows });
  })
  .post("/locations", json(LocationInput), async (c) => {
    requireRole(c, "recruiter", "admin");
    const body = c.req.valid("json");
    await assertUniqueName(body.name);
    const db = await getDb();
    const [l] = await db.insert(t).values(body).returning();
    return c.json({ location: l });
  })
  .patch("/locations/:id", json(LocationPatch), async (c) => {
    requireRole(c, "recruiter", "admin");
    const body = c.req.valid("json");
    const db = await getDb();
    const [current] = await db.select().from(t).where(eq(t.id, c.req.param("id")));
    if (!current) throw new HTTPException(404, { message: "Location not found." });
    if (body.name) await assertUniqueName(body.name, current.id);
    const [l] = await db.update(t).set({ ...body, updatedAt: new Date() }).where(eq(t.id, current.id)).returning();
    return c.json({ location: l });
  })
  .delete("/locations/:id", async (c) => {
    requireRole(c, "recruiter", "admin");
    const db = await getDb();
    // Requests that used it keep their copied arrangement, hours and countries; only the link is cleared.
    const [l] = await db.delete(t).where(eq(t.id, c.req.param("id"))).returning({ id: t.id });
    if (!l) throw new HTTPException(404, { message: "Location not found." });
    return c.json({ ok: true });
  });

async function assertUniqueName(name: string, exceptId?: string) {
  const db = await getDb();
  const [dupe] = await db.select({ id: t.id }).from(t).where(sql`lower(${t.name}) = lower(${name.trim()})`);
  if (dupe && dupe.id !== exceptId) throw new HTTPException(409, { message: `"${name.trim()}" is already in the list.` });
}
