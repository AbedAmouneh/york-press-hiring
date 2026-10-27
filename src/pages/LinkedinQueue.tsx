import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Badge, Card, CardContent, EmptyState, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { OutreachData, Msg } from "./Outreach";

function MessageCard({ m, onDone }: { m: Msg; onDone: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState(m.body);
  const [copied, setCopied] = useState(false);
  const dirty = body !== m.body;
  async function act(action: "approve" | "cancel" | "sent") {
    try {
      if (dirty) await api(`/outreach/${m.id}`, { method: "PATCH", body: { body } });
      await api(`/outreach/${m.id}/${action}`, { method: "POST" });
      onDone();
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }
  return (
    <Card>
      <CardContent className="grid gap-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-semibold">{m.candidateName} <span className="font-normal text-muted-foreground">· #{m.rank ?? "—"} for {m.roleTitle}</span></div>
            <a href={m.toAddress} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all font-mono text-xs underline" data-profile-url>{m.toAddress} <ExternalLink className="h-3 w-3" /></a>
          </div>
          <Badge tone={m.status === "approved" ? "info" : "warn"}>{m.status === "approved" ? "Approved — ready to send" : "Needs your approval"}</Badge>
        </div>
        {m.status === "awaiting_approval" ? (
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} aria-label={`Message to ${m.candidateName}`} />
        ) : (
          <p className="rounded-md border bg-secondary/40 p-3 text-sm" data-message>{m.body}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="num mr-auto text-xs text-muted-foreground">{body.length} / 300</span>
          <Button size="sm" variant="ghost" onClick={copy}>{copied ? <Check /> : <Copy />} Copy</Button>
          {m.status === "awaiting_approval" && <Button size="sm" onClick={() => act("approve")}>Approve</Button>}
          {m.status === "approved" && <Button size="sm" variant="outline" onClick={() => act("sent")}>Mark as sent</Button>}
          <Button size="sm" variant="ghost" onClick={() => act("cancel")}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LinkedinQueue() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["outreach", "linkedin"], queryFn: () => api<OutreachData>("/outreach?channel=linkedin&status=awaiting_approval,approved") });
  const sent = useQuery({ queryKey: ["outreach", "linkedin-sent"], queryFn: () => api<OutreachData>("/outreach?channel=linkedin&status=sent") });
  const msgs = q.data?.messages ?? [];
  const approved = msgs.filter((m) => m.status === "approved");
  const waiting = msgs.filter((m) => m.status === "awaiting_approval");
  const refresh = () => qc.invalidateQueries({ queryKey: ["outreach"] });

  return (
    <>
      <PageHeader eyebrow="Top-10 candidates without an email" title="LinkedIn queue" />
      <Card className="mb-6 border-brand bg-accent">
        <CardContent className="grid gap-1 pt-5 text-sm">
          <p><b>How sending works:</b> approve the messages below, then open Cowork and say <i>"Send the approved LinkedIn messages from the York Press Hiring queue."</i></p>
          <p className="text-muted-foreground">Claude opens each profile in your Chrome, sends the note at a human pace (15–45 seconds apart), marks it sent here, and stops at any LinkedIn warning. Nothing is sent from this page by itself.</p>
        </CardContent>
      </Card>
      {q.isLoading ? <Spinner /> : (
        <div className="grid gap-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Approved — ready to send ({approved.length})</h2>
            {approved.length ? <div className="grid gap-3">{approved.map((m) => <MessageCard key={m.id} m={m} onDone={refresh} />)}</div> : <EmptyState title="Nothing approved yet" />}
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Needs your approval ({waiting.length})</h2>
            {waiting.length ? <div className="grid gap-3">{waiting.map((m) => <MessageCard key={m.id} m={m} onDone={refresh} />)}</div> : <EmptyState title="All caught up" />}
          </section>
          {!!sent.data?.messages.length && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Sent ({sent.data.messages.length})</h2>
              <ul className="grid gap-1 text-sm">
                {sent.data.messages.map((m) => <li key={m.id}><Link to={`/roles/${m.requestId}`} className="hover:underline">{m.candidateName}</Link> <span className="text-muted-foreground">· {m.roleTitle}</span></li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
