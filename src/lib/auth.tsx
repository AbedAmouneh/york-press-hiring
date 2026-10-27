import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Me } from "./types";
import type { Role } from "../../shared/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: Me | null; demoMode: boolean; demoPassword?: string }>("/auth/me"),
    staleTime: 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api("/auth/logout", { method: "POST" });
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
