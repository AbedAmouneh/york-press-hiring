import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { fmtDate } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge, DataTable, EmptyState, Spinner, Td, Th, useToast } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";


const TONE: Record<string, "warn" | "good" | "bad" | "neutral" | "info"> = { queued: "warn", sent: "good", failed: "bad", cancelled: "neutral", approved: "info", awaiting_approval: "warn" };

export default function Outreach() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["outreach", "email"], queryFn: () => call(rpc.outreach.$get({ query: { channel: "email" } })) });
  const msgs = q.data?.messages ?? [];
  const queued = msgs.filter((m) => m.status === "queued").length;

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
      <PageHeader eyebrow="Automatic, from your templates" title="Email outreach">
        {q.data && <span className="text-sm text-muted-foreground">Sent today <b className="num">{q.data.sentToday}</b> of <span className="num">{q.data.dailyCap}</span> · {queued} queued</span>}
        <Button onClick={sendNow} disabled={!queued || !q.data?.autoSendEnabled}><Send /> Send queued now</Button>
      </PageHeader>
      {q.data && !q.data.autoSendEnabled && (
        <Card className="mb-4 border-destructive bg-red-50 px-4 py-3 text-sm font-medium text-destructive">Automatic sending is paused. Queued emails wait until you turn it back on in <Link to="/settings" className="underline">Settings</Link>.</Card>
      )}
      {q.isLoading ? <Spinner /> : msgs.length ? (
        <DataTable>
          <TableHeader><TableRow><Th>Candidate</Th><Th>Role</Th><Th>To</Th><Th>Status</Th><Th>Sent</Th><Th>Follow up</Th><Th /></TableRow></TableHeader>
          <TableBody>
            {msgs.map((m) => (
              <TableRow key={m.id}>
                <Td><div className="font-medium">{m.candidateName}</div><div className="text-xs text-muted-foreground">#{m.rank ?? "—"} · score {m.score ?? "—"}</div></Td>
                <Td><Link className="hover:underline" to={`/roles/${m.requestId}`}>{m.roleTitle}</Link></Td>
                <Td className="font-mono text-xs">{m.toAddress}</Td>
                <Td><Badge tone={TONE[m.status] ?? "neutral"}>{m.status}</Badge></Td>
                <Td className="num text-xs">{fmtDate(m.sentAt)}</Td>
                <Td className="num text-xs">{fmtDate(m.followUpDate)}</Td>
                <Td>{m.status === "queued" && <Button size="sm" variant="ghost" onClick={() => cancel(m.id)}>Cancel</Button>}</Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      ) : <EmptyState title="No emails yet">Top-10 candidates with an email address are contacted automatically after each sourcing run.</EmptyState>}
    </>
  );
}
