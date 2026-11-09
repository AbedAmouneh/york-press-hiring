import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client.js";
import { json, query } from "../validate.js";
import { requireRole, type AppEnv } from "../auth.js";
import { UniversityInput } from "../../shared/schemas.js";

const t = schema.universities;

/** Universities per country for the pickers. Everyone signed in reads; people who make requests can add one. */
export const universityRoutes = new Hono<AppEnv>()
  .get("/universities/countries", async (c) => {
    const db = await getDb();
    const rows = await db.select({ country: t.country, count: sql<number>`count(*)::int` }).from(t).groupBy(t.country).orderBy(asc(t.country));
    return c.json({ countries: rows });
  })
  .get("/universities", query(z.object({ country: z.string().trim().min(2) })), async (c) => {
    const { country } = c.req.valid("query");
    const db = await getDb();
    const rows = await db.select({ id: t.id, name: t.name, city: t.city, aka: t.aka }).from(t).where(sql`lower(${t.country}) = lower(${country})`).orderBy(asc(t.name));
    return c.json({ universities: rows });
  })
  .post("/universities", json(UniversityInput), async (c) => {
    requireRole(c, "manager", "recruiter", "admin");
    const body = c.req.valid("json");
    const db = await getDb();
    const [dupe] = await db.select({ id: t.id, name: t.name }).from(t).where(and(eq(t.country, body.country), sql`lower(${t.name}) = lower(${body.name})`));
    if (dupe) throw new HTTPException(409, { message: `"${dupe.name}" is already in the list.` });
    const [u] = await db.insert(t).values({ country: body.country, name: body.name, city: body.city ?? null }).returning({ id: t.id, name: t.name, city: t.city, aka: t.aka, country: t.country });
    return c.json({ university: u });
  });
