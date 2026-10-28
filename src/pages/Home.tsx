import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, Circle } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { can, useMe } from "@/lib/auth";
import { greeting, stageOf, tasksFor } from "@/lib/home";
import { StageBar } from "@/components/StageBar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="num text-2xl font-semibold tracking-tight">{value}</div>
    </Card>
  );
}

export default function Home() {
  const me = useMe().data!.user!;
  const staff = can(me, "recruiter", "admin");
  const all = useQuery({ queryKey: ["requests", "all"], queryFn: () => call(rpc.requests.$get({ query: {} })) });
  const out = useQuery({
    queryKey: ["outreach", "home"],
    queryFn: () => call(rpc.outreach.$get({ query: { status: "awaiting_approval,approved,failed" } })),
    enabled: staff,
  });

  const requests = all.data?.requests ?? [];
  const roles = requests.filter((r) => r.status === "sourcing" || r.status === "open");
  const sum = (k: "screened" | "contacted" | "hmYes" | "hmPending", rows = roles) => rows.reduce((n, r) => n + r.stats[k], 0);
  const metrics: [string, string | number][] = staff
    ? [["Open roles", roles.length], ["Screened", sum("screened")], ["Contacted", sum("contacted")], ["Emails today", out.data ? `${out.data.sentToday} / ${out.data.dailyCap}` : "–"]]
    : can(me, "ceo")
      ? [["Waiting for you", requests.filter((r) => r.status === "submitted").length], ["Open roles", roles.length], ["Screened", sum("screened")], ["Hiring manager yes", sum("hmYes")]]
      : [["My requests", requests.filter((r) => r.requesterId === me.id && !["closed", "rejected"].includes(r.status)).length], ["Open roles", roles.length], ["To review", sum("hmPending", roles.filter((r) => r.hiringManagerId === me.id))], ["Hiring manager yes", sum("hmYes")]];
  const tasks = tasksFor(me, requests, out.data?.messages);
  const firstName = me.name.split(" ")[0];
  const loading = all.isLoading;

  return (
    <>
      <div className="mb-6">
        <div className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting()}, {firstName}</h1>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />) : metrics.map(([l, v]) => <Metric key={l} label={l} value={v} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 p-0 lg:col-span-2">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="font-semibold">Roles in progress</h2>
            <Link to="/roles" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">All roles <ArrowRight className="size-3.5" /></Link>
          </div>
          {loading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : roles.length ? (
            <ul className="divide-y">
              {roles.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link to={`/roles/${r.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-secondary/50">
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{r.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="text-xs text-muted-foreground">{r.stats.screened} screened · {r.stats.contacted} contacted</span>
                    </span>
                    <StageBar stage={stageOf(r)} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">No open roles yet.</p>
          )}
        </Card>

        <Card className="gap-0 p-0">
          <div className="border-b px-5 py-3.5"><h2 className="font-semibold">Needs you</h2></div>
          {loading ? (
            <div className="space-y-3 p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-6" />)}</div>
          ) : tasks.length ? (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.key}>
                  <Link to={t.to} className="group flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-secondary/50">
                    <Circle className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                    <span className="flex-1">{t.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <CircleCheck className="size-6 text-success" />
              All caught up
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
