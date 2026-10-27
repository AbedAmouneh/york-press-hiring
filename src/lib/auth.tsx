import { useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "./rpc";
import type { Me } from "./types";
import type { Role } from "../../shared/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => call(rpc.auth.me.$get()),
    staleTime: 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await call(rpc.auth.logout.$post());
    qc.clear();
    window.location.href = "/login";
  };
}

export const can = (user: Me | null | undefined, ...roles: Role[]) => !!user && roles.some((r) => user.roles.includes(r));

export function homeFor(user: Me) {
  if (can(user, "recruiter", "admin")) return "/roles";
  if (can(user, "ceo")) return "/approvals";
  if (can(user, "manager")) return "/requests";
  return "/roles";
}
