import { HTTPException } from "hono/http-exception";
import { eq, or } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { hasRole, type SessionUser } from "../auth.js";
import { needsTwoFactorSetup } from "../services/two-factor.js";
import { isTestAddress } from "../services/email.js";

type Request = typeof schema.roleRequests.$inferSelect;

export const isStaff = (u: SessionUser) => hasRole(u, "admin", "recruiter", "ceo");

export function canViewRequest(u: SessionUser, r: Request) {
  return isStaff(u) || r.requesterId === u.id || r.hiringManagerId === u.id;
}

/** `canViewRequest` as a SQL condition on role_requests, for lists and joins (undefined: staff see everything). */
export function visibleRequests(u: SessionUser) {
  const t = schema.roleRequests;
  return isStaff(u) ? undefined : or(eq(t.requesterId, u.id), eq(t.hiringManagerId, u.id));
}

/** Recruiter/admin/CEO, the hiring manager, and the requesting manager (read-only). */
export const canViewCandidates = canViewRequest;

/**
 * The demo admin (and any demo account) may only manage demo accounts and test addresses (example.com, *.test),
 * so the public demo can open the admin screens without touching real people's accounts or inviting anyone real.
 */
export function demoCanManage(actor: SessionUser, target: { email: string; isDemo?: boolean }) {
  if (actor.isDemo && !target.isDemo && !isTestAddress(target.email)) {
    throw new HTTPException(403, { message: "Demo accounts can only change demo accounts and test addresses (like name@example.com)." });
  }
}

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
  passwordChangeRequired: u.mustChangePassword,
});
