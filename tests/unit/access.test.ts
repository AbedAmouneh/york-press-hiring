import { describe, expect, it } from "vitest";
import { canEditCandidates, canViewRequest, isStaff } from "../../server/routes/access.js";
import { hasRole, type SessionUser } from "../../server/auth.js";
import type { Role } from "../../shared/types.js";
import type { schema } from "../../server/db/client.js";

type Request = typeof schema.roleRequests.$inferSelect;

const user = (id: string, ...roles: Role[]) => ({ id, roles }) as SessionUser;
const request = { requesterId: "manager-1", hiringManagerId: "hm-1" } as Request;

describe("permissions", () => {
  it("knows who is staff", () => {
    expect(isStaff(user("a", "admin"))).toBe(true);
    expect(isStaff(user("c", "ceo"))).toBe(true);
    expect(isStaff(user("m", "manager"))).toBe(false);
    expect(hasRole(user("x", "manager", "hm"), "hm")).toBe(true);
  });

  it("lets staff, the requester and the hiring manager see a request", () => {
    expect(canViewRequest(user("r", "recruiter"), request)).toBe(true);
    expect(canViewRequest(user("manager-1", "manager"), request)).toBe(true);
    expect(canViewRequest(user("hm-1", "hm"), request)).toBe(true);
    expect(canViewRequest(user("manager-2", "manager"), request)).toBe(false);
  });

  it("lets only recruiters, admins and the hiring manager edit candidates", () => {
    expect(canEditCandidates(user("r", "recruiter"), request)).toBe(true);
    expect(canEditCandidates(user("hm-1", "hm"), request)).toBe(true);
    expect(canEditCandidates(user("manager-1", "manager"), request)).toBe(false);
    expect(canEditCandidates(user("c", "ceo"), request)).toBe(false);
  });
});
