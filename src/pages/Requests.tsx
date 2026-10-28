import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { can, useMe } from "@/lib/auth";
import type { RequestRow } from "@/lib/types";
import { fmtDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { RequestStatusBadge } from "@/components/Status";
import { DeptDot, EmptyState } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** One request as a list row: what it is, the last comment if it was sent back, and where it stands. */
function RequestRowItem({ r, showBudget }: { r: RequestRow; showBudget: boolean }) {
  const comment = r.lastEvent?.comment && ["Requested changes", "Rejected"].includes(r.lastEvent.action) ? r.lastEvent : null;
  return (
    <li>
      <Link to={`/requests/${r.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-secondary/50">
        <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">{r.code}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{r.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <DeptDot name={r.department} /><span aria-hidden>·</span><span>{r.seniority}</span>
            {r.headcount > 1 && <><span aria-hidden>·</span><span>{r.headcount} hires</span></>}
            {showBudget && <><span aria-hidden>·</span><span>{money(r.salaryMin, r.salaryMax, r.currency, r.salaryPeriod)}</span></>}
          </span>
          {comment && <span className="mt-1.5 block rounded-md bg-chip-amber/15 px-2.5 py-1 text-xs"><b>{comment.actorName}:</b> {comment.comment}</span>}
        </span>
        <span className="flex flex-col items-end gap-1">
          <RequestStatusBadge status={r.status} />
          <span className="text-xs text-muted-foreground">{r.requesterName ? `${r.requesterName} · ` : ""}{fmtDate(r.lastEvent?.createdAt ?? r.createdAt)}</span>
        </span>
      </Link>
    </li>
  );
}

function List({ rows, showBudget }: { rows: RequestRow[]; showBudget: boolean }) {
  return (
    <Card className="gap-0 p-0">
      <ul className="divide-y">{rows.map((r) => <RequestRowItem key={r.id} r={r} showBudget={showBudget} />)}</ul>
    </Card>
  );
}

export default function Requests({ scope }: { scope: "all" | "approvals" }) {
  const me = useMe().data!.user!;
  const q = useQuery({ queryKey: ["requests", scope], queryFn: () => call(rpc.requests.$get({ query: scope === "approvals" ? { scope: "approvals" } : {} })) });
  const canCreate = can(me, "manager", "recruiter", "admin");
  const approvals = scope === "approvals";
  const rows = q.data?.requests ?? [];
  const decided = useQuery({
    queryKey: ["requests", "all"],
    queryFn: () => call(rpc.requests.$get({ query: {} })),
    enabled: approvals,
  });
  const recent = (decided.data?.requests ?? []).filter((r) => !["submitted", "draft"].includes(r.status)).slice(0, 10);

  return (
    <>
      <PageHeader title={approvals ? (rows.length ? `${rows.length} waiting for you` : "Approvals") : "Requests"} />
      {q.isLoading ? (
        <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : rows.length ? (
        <List rows={rows} showBudget={approvals} />
      ) : (
        <EmptyState title={approvals ? "All caught up" : "No requests yet"}>
          {approvals ? "New requests will appear here." : canCreate ? "Use New request at the top." : null}
        </EmptyState>
      )}
      {approvals && !!recent.length && (
        <>
          <h2 className="mb-3 mt-10 text-sm font-semibold text-muted-foreground">Recently decided</h2>
          <List rows={recent} showBudget />
        </>
      )}
    </>
  );
}
