import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { stageOf } from "@/lib/home";
import { PageHeader } from "@/components/AppShell";
import { RequestStatusBadge } from "@/components/Status";
import { StageBar } from "@/components/StageBar";
import { DeptDot, EmptyState, FilterChips } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const FILTERS = [
  ["all", "All"],
  ["sourcing", "Sourcing"],
  ["open", "Open"],
  ["closed", "Closed"],
] as const;

export default function Roles() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const q = useQuery({
    queryKey: ["requests", "roles"],
    queryFn: () => call(rpc.requests.$get({ query: { scope: "roles" } })),
    refetchInterval: (query) => (query.state.data?.requests.some((r) => r.status === "sourcing") ? 4000 : false),
  });
  const all = (q.data?.requests ?? []).sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"));
  const rows = filter === "all" ? all : all.filter((r) => r.status === filter);
  const count = (f: string) => (f === "all" ? all.length : all.filter((r) => r.status === f).length);

  return (
    <>
      <PageHeader title="Roles" />
      <FilterChips label="Filter roles" options={FILTERS.map(([k, l]) => ({ key: k, label: l, count: count(k) }))} value={filter} onChange={(k) => setFilter(k as typeof filter)} />
      {q.isLoading ? (
        <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : rows.length ? (
        <Card className="gap-0 p-0">
          <div className="hidden grid-cols-[64px_1fr_160px_repeat(3,72px)_96px] gap-4 border-b px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid">
            <span>Code</span><span>Role</span><span>Stage</span><span className="text-right">Screened</span><span className="text-right">Top 10</span><span className="text-right">HM yes</span><span />
          </div>
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/roles/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-secondary/50 md:grid-cols-[64px_1fr_160px_repeat(3,72px)_96px]">
                  <span className="hidden font-mono text-xs text-muted-foreground md:block">{r.code}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.title}</span>
                    <DeptDot name={r.department} className="text-xs text-muted-foreground" />
                  </span>
                  <StageBar stage={stageOf(r)} className="hidden md:block" />
                  <span className="num hidden text-right md:block">{r.stats.screened}</span>
                  <span className="num hidden text-right md:block">{r.stats.topAvg || "–"}</span>
                  <span className="num hidden text-right md:block">{r.stats.hmYes}</span>
                  <span className="justify-self-end"><RequestStatusBadge status={r.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title={filter === "all" ? "No roles yet" : "Nothing here"}>{filter === "all" ? "A role appears here once Khalil approves a request." : null}</EmptyState>
      )}
    </>
  );
}
