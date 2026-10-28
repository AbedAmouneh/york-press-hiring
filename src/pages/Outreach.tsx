import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { cn, fmtDate } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, DataTable, EmptyState, FilterChips, Spinner, Td, Th, useToast } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";

const TONE: Record<string, "warn" | "good" | "bad" | "neutral" | "info"> = { queued: "warn", sent: "good", failed: "bad", cancelled: "neutral", approved: "info", awaiting_approval: "warn" };
const FILTERS = [["queued", "Queued"], ["sent", "Sent"], ["failed", "Failed"], ["all", "All"]] as const;

export default function Outreach() {
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setFilter] = useState<(typeof FILTERS)[number][0] | null>(null);
  const q = useQuery({ queryKey: ["outreach", "email"], queryFn: () => call(rpc.outreach.$get({ query: { channel: "email" } })) });
  const msgs = q.data?.messages ?? [];
  const count = (f: string) => (f === "all" ? msgs.length : msgs.filter((m) => m.status === f).length);
  const queued = count("queued");
  // Open on the queue when something is waiting, otherwise on everything.
  const filter = picked ?? (queued ? "queued" : "all");
  const rows = filter === "all" ? msgs : msgs.filter((m) => m.status === filter);
  const sentToday = q.data?.sentToday ?? 0;
  const cap = q.data?.dailyCap ?? 0;
  const on = !!q.data?.autoSendEnabled;

  async function sendNow() {
    const r = await call(rpc.outreach["send-now"].$post());
    toast(r.paused ? "Sending is paused in Settings." : `${r.sent} email(s) sent${r.remaining ? `; ${r.remaining} wait for tomorrow's cap` : ""}.`);
    qc.invalidateQueries({ queryKey: ["outreach"] });
  }
  async function cancel(id: string) {
    await call(rpc.outreach[":id"].cancel.$post({ param: { id } }));
    qc.invalidateQueries({ queryKey: ["outreach"] });
  }

  return (
    <>
      <PageHeader title="Email outreach">
        <Button onClick={sendNow} disabled={!queued || !on}><Send /> Send queued now</Button>
      </PageHeader>

      {q.data && (
        <Card className="mb-6 flex-row flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <div className="min-w-56 flex-1">
            <div className="mb-1.5 flex items-baseline gap-1.5"><span className="num text-2xl font-semibold">{sentToday}</span><span className="text-sm text-muted-foreground">of {cap} sent today</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${cap ? Math.min(100, (sentToday / cap) * 100) : 0}%` }} /></div>
          </div>
          <Link to="/settings" className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm", on ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
            <span className={cn("size-2 rounded-full", on ? "bg-success" : "bg-destructive")} />
            {on ? "Sending on" : "Sending paused"}
          </Link>
        </Card>
      )}

      <FilterChips label="Filter emails" options={FILTERS.map(([k, l]) => ({ key: k, label: l, count: count(k) }))} value={filter} onChange={(k) => setFilter(k as typeof filter)} />

      {q.isLoading ? <Spinner /> : rows.length ? (
        <DataTable>
          <TableHeader><TableRow><Th>Candidate</Th><Th>Role</Th><Th>To</Th><Th>Status</Th><Th>Sent</Th><Th>Follow up</Th><Th /></TableRow></TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={m.candidateName} size="sm" />
                    <div><div className="font-medium">{m.candidateName}</div><div className="text-xs text-muted-foreground">#{m.rank ?? "–"} · {m.score ?? "–"}</div></div>
                  </div>
                </Td>
                <Td><Link className="hover:underline" to={`/roles/${m.requestId}`}>{m.roleTitle}</Link></Td>
                <Td className="text-xs text-muted-foreground">{m.toAddress}</Td>
                <Td><Badge tone={TONE[m.status] ?? "neutral"} className="capitalize">{m.status}</Badge></Td>
                <Td className="num text-xs">{fmtDate(m.sentAt)}</Td>
                <Td className="num text-xs">{fmtDate(m.followUpDate)}</Td>
                <Td>{m.status === "queued" && <Button size="sm" variant="ghost" onClick={() => cancel(m.id)}>Cancel</Button>}</Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      ) : <EmptyState title={msgs.length ? "Nothing here" : "No emails yet"}>{msgs.length ? null : "Top 10 candidates with an email are contacted after each run."}</EmptyState>}
    </>
  );
}
