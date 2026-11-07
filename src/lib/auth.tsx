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

/** Everyone lands on Home, which adapts to their roles. */
export function homeFor(_user: Me) {
  return "/";
}

/** The page someone opened before signing in (`?next=`), if it's a path in this app; never another site. */
export function nextPath(search: string): string | null {
  const next = new URLSearchParams(search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login") ? next : null;
}
