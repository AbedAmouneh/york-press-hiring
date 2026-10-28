import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { call, rpc } from "@/lib/rpc";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import type { OutreachMessage as Msg } from "@/lib/types";
import { Avatar, EmptyState, Spinner, useToast } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function MessageCard({ m, onDone }: { m: Msg; onDone: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState(m.body);
  const [copied, setCopied] = useState(false);
  const dirty = body !== m.body;
  async function act(action: "approve" | "cancel" | "sent") {
    try {
      if (dirty) await call(rpc.outreach[":id"].$patch({ param: { id: m.id }, json: { body } }));
      await call(rpc.outreach[":id"][action].$post({ param: { id: m.id } }));
      onDone();
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-3">
        <Avatar name={m.candidateName} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{m.candidateName} <span className="font-normal text-muted-foreground">· #{m.rank ?? "–"} for {m.roleTitle}</span></div>
          <a href={m.toAddress} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-muted-foreground hover:text-foreground hover:underline" data-profile-url>{m.toAddress} <ExternalLink className="size-3" /></a>
        </div>
      </div>
      {m.status === "awaiting_approval" ? (
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} aria-label={`Message to ${m.candidateName}`} />
      ) : (
        <p className="rounded-lg bg-secondary/60 p-3 text-sm" data-message>{m.body}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("num mr-auto text-xs", body.length > 280 ? "text-warning" : "text-muted-foreground")}>{body.length}/300</span>
        <Button size="sm" variant="ghost" onClick={copy}>{copied ? <Check /> : <Copy />} Copy</Button>
        <Button size="sm" variant="ghost" onClick={() => act("cancel")}>Don&apos;t send</Button>
        {m.status === "awaiting_approval" && <Button size="sm" onClick={() => act("approve")}>Approve</Button>}
        {m.status === "approved" && <Button size="sm" variant="outline" onClick={() => act("sent")}>Mark as sent</Button>}
      </div>
    </Card>
  );
}

export default function LinkedinQueue() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["outreach", "linkedin"], queryFn: () => call(rpc.outreach.$get({ query: { channel: "linkedin", status: "awaiting_approval,approved" } })) });
  const sent = useQuery({ queryKey: ["outreach", "linkedin-sent"], queryFn: () => call(rpc.outreach.$get({ query: { channel: "linkedin", status: "sent" } })) });
  const msgs = q.data?.messages ?? [];
  const approved = msgs.filter((m) => m.status === "approved");
  const waiting = msgs.filter((m) => m.status === "awaiting_approval");
  const refresh = () => qc.invalidateQueries({ queryKey: ["outreach"] });

  return (
    <>
      <PageHeader title="LinkedIn queue" />
      <p className="mb-6 flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>Approve notes here. To send them, tell Cowork: <i>"Send the approved LinkedIn messages from the York Press Hiring queue."</i></span>
      </p>
      {q.isLoading ? <Spinner /> : (
        <div className="grid gap-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold">Approved — ready to send <span className="num font-normal text-muted-foreground">{approved.length}</span></h2>
            {approved.length ? <div className="grid gap-3">{approved.map((m) => <MessageCard key={m.id} m={m} onDone={refresh} />)}</div> : <EmptyState title="Nothing approved yet" />}
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Needs your approval <span className="num font-normal text-muted-foreground">{waiting.length}</span></h2>
            {waiting.length ? <div className="grid gap-3">{waiting.map((m) => <MessageCard key={m.id} m={m} onDone={refresh} />)}</div> : <EmptyState title="All caught up" />}
          </section>
          {!!sent.data?.messages.length && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">Sent <span className="num font-normal text-muted-foreground">{sent.data.messages.length}</span></h2>
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
