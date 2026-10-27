import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { hasRole, type SessionUser } from "../auth.js";
import { needsTwoFactorSetup } from "../services/two-factor.js";

type Request = typeof schema.roleRequests.$inferSelect;

export const isStaff = (u: SessionUser) => hasRole(u, "admin", "recruiter", "ceo");

export function canViewRequest(u: SessionUser, r: Request) {
  return isStaff(u) || r.requesterId === u.id || r.hiringManagerId === u.id;
}

/** Recruiter/admin/CEO, the hiring manager, and the requesting manager (read-only). */
export const canViewCandidates = canViewRequest;

export const canEditCandidates = (u: SessionUser, r: Request) => hasRole(u, "admin", "recruiter") || r.hiringManagerId === u.id;

export async function loadRequest(id: string, u: SessionUser) {
  const db = await getDb();
  const [r] = await db.select().from(schema.roleRequests).where(eq(schema.roleRequests.id, id));
  if (!r) throw new HTTPException(404, { message: "Request not found." });
  if (!canViewRequest(u, r)) throw new HTTPException(403, { message: "You don't have access to this request." });
  return r;
}

export const publicUser = (u: SessionUser) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  roles: u.roles,
  department: u.department,
  active: u.active,
  isDemo: u.isDemo,
  invited: !!u.inviteToken && !u.passwordHash,
  lastLoginAt: u.lastLoginAt,
  twoFactorEnabled: !!u.totpEnabledAt,
  twoFactorSetupRequired: needsTwoFactorSetup(u),
});
