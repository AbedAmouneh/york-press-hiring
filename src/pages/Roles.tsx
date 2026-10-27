import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { can, useMe } from "@/lib/auth";
import type { RequestRow } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { RequestStatusBadge } from "@/components/Status";
import { Card, EmptyState, Spinner } from "@/components/ui/misc";

export default function Roles() {
  const me = useMe().data!.user!;
  const q = useQuery({
    queryKey: ["requests", "roles"],
    queryFn: () => api<{ requests: RequestRow[] }>("/requests?scope=roles"),
    refetchInterval: (query) => (query.state.data?.requests.some((r) => r.status === "sourcing") ? 4000 : false),
  });
  const rows = (q.data?.requests ?? []).sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"));
  return (
    <>
      <PageHeader eyebrow={can(me, "recruiter", "admin", "ceo") ? "Approved positions" : "Roles you're involved in"} title={can(me, "recruiter", "admin", "ceo") ? "Open roles" : "My roles"} />
      {q.isLoading ? <Spinner /> : rows.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <Link key={r.id} to={`/roles/${r.id}`}>
              <Card className="h-full p-4 transition-colors hover:border-foreground/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{r.code} · {r.department}</div>
                    <h3 className="font-semibold">{r.title}</h3>
                  </div>
                  <RequestStatusBadge status={r.status} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[["Screened", r.stats.screened], ["Top 10 avg", r.stats.topAvg || "—"], ["Contacted", r.stats.contacted], ["HM yes", r.stats.hmYes]].map(([k, v]) => (
                    <div key={k as string} className="rounded-md bg-secondary/60 px-1 py-2">
                      <div className="num text-lg font-semibold">{v}</div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No open roles yet">A role appears here as soon as Khalil approves a request.</EmptyState>
      )}
    </>
  );
}
