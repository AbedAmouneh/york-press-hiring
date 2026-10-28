import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { can, useMe } from "@/lib/auth";
import type { RequestRow } from "@/lib/types";
import { fmtDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { RequestStatusBadge } from "@/components/Status";
import { EmptyState, Spinner } from "@/components/kit";
import { Card } from "@/components/ui/card";

export function RequestCard({ r }: { r: RequestRow }) {
  const comment = r.lastEvent?.comment && ["Requested changes", "Rejected"].includes(r.lastEvent.action) ? r.lastEvent : null;
  return (
    <Link to={`/requests/${r.id}`} className="block">
      <Card className="flex flex-row flex-wrap items-start justify-between gap-3 p-4 transition-colors hover:border-foreground/30">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
            <h3 className="font-semibold">{r.title}</h3>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {r.department} · {r.seniority} · {r.headcount} hire{r.headcount > 1 ? "s" : ""} · {money(r.salaryMin, r.salaryMax, r.currency, r.salaryPeriod)}
          </p>
          {comment && (
            <p className={`mt-2 rounded-r border-l-[3px] px-3 py-1.5 text-sm ${r.status === "rejected" ? "border-destructive bg-red-50" : "border-warning bg-amber-50"}`}>
              <b>{comment.actorName}:</b> {comment.comment}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <RequestStatusBadge status={r.status} />
          <span className="text-xs text-muted-foreground">
            {r.requesterName ? `${r.requesterName} · ` : ""}{r.lastEvent ? `${r.lastEvent.action} ${fmtDate(r.lastEvent.createdAt)}` : fmtDate(r.createdAt)}
          </span>
        </div>
      </Card>
    </Link>
  );
}

export default function Requests({ scope }: { scope: "all" | "approvals" }) {
  const me = useMe().data!.user!;
  const q = useQuery({ queryKey: ["requests", scope], queryFn: () => call(rpc.requests.$get({ query: scope === "approvals" ? { scope: "approvals" } : {} })) });
  const staff = can(me, "admin", "recruiter", "ceo");
  const canCreate = can(me, "manager", "recruiter", "admin");
  const rows = q.data?.requests ?? [];
  const decided = useQuery({
    queryKey: ["requests", "all"],
    queryFn: () => call(rpc.requests.$get({ query: {} })),
    enabled: scope === "approvals",
  });

  return (
    <>
      <PageHeader
        eyebrow={scope === "approvals" ? "CEO approvals" : staff ? "All departments" : "Your requests"}
        title={scope === "approvals" ? (rows.length ? `${rows.length} request${rows.length > 1 ? "s" : ""} waiting for you` : "Nothing waiting for you") : staff ? "All requests" : "My requests"}
      />
      {q.isLoading ? <Spinner /> : rows.length ? (
        <div className="grid gap-3">{rows.map((r) => <RequestCard key={r.id} r={r} />)}</div>
      ) : (
        <EmptyState title={scope === "approvals" ? "All caught up" : "No requests yet"}>
          {scope === "approvals" ? "New requests appear here and arrive by email." : canCreate ? "Use New request at the top." : null}
        </EmptyState>
      )}
      {scope === "approvals" && !!decided.data?.requests.filter((r) => !["submitted", "draft"].includes(r.status)).length && (
        <>
          <h2 className="mb-3 mt-10 text-lg font-semibold">Recently decided</h2>
          <div className="grid gap-3">
            {decided.data.requests.filter((r) => !["submitted", "draft"].includes(r.status)).slice(0, 10).map((r) => <RequestCard key={r.id} r={r} />)}
          </div>
        </>
      )}
    </>
  );
}
