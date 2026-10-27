import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Spinner, Table, Td, Th } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

export type Msg = {
  id: string; channel: "email" | "linkedin"; status: string; toAddress: string; subject: string | null; body: string; queuedAt: string; sentAt: string | null;
  candidateName: string; rank: number | null; score: number | null; roleTitle: string; requestId: string; roleCandidateId: string; dateContacted: string | null; followUpDate: string | null;
};
export type OutreachData = { messages: Msg[]; sentToday: number; dailyCap: number; autoSendEnabled: boolean };

const TONE: Record<string, "warn" | "good" | "bad" | "neutral" | "info"> = { queued: "warn", sent: "good", failed: "bad", cancelled: "neutral", approved: "info", awaiting_approval: "warn" };

export default function Outreach() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["outreach", "email"], queryFn: () => api<OutreachData>("/outreach?channel=email") });
  const msgs = q.data?.messages ?? [];
  const queued = msgs.filter((m) => m.status === "queued").length;

  async function sendNow() {
    const r = await api<{ sent: number; paused: boolean; remaining: number }>("/outreach/send-now", { method: "POST" });
    toast(r.paused ? "Sending is paused in Settings." : `${r.sent} email(s) sent${r.remaining ? `; ${r.remaining} wait for tomorrow's cap` : ""}.`);
    qc.invalidateQueries({ queryKey: ["outreach"] });
  }
  async function cancel(id: string) {
    await api(`/outreach/${id}/cancel`, { method: "POST" });
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
        <Table>
          <thead><tr><Th>Candidate</Th><Th>Role</Th><Th>To</Th><Th>Status</Th><Th>Sent</Th><Th>Follow up</Th><Th /></tr></thead>
          <tbody>
            {msgs.map((m) => (
              <tr key={m.id}>
                <Td><div className="font-medium">{m.candidateName}</div><div className="text-xs text-muted-foreground">#{m.rank ?? "—"} · score {m.score ?? "—"}</div></Td>
                <Td><Link className="hover:underline" to={`/roles/${m.requestId}`}>{m.roleTitle}</Link></Td>
                <Td className="font-mono text-xs">{m.toAddress}</Td>
                <Td><Badge tone={TONE[m.status] ?? "neutral"}>{m.status}</Badge></Td>
                <Td className="num text-xs">{fmtDate(m.sentAt)}</Td>
                <Td className="num text-xs">{fmtDate(m.followUpDate)}</Td>
                <Td>{m.status === "queued" && <Button size="sm" variant="ghost" onClick={() => cancel(m.id)}>Cancel</Button>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState title="No emails yet">Top-10 candidates with an email address are contacted automatically after each sourcing run.</EmptyState>}
    </>
  );
}
