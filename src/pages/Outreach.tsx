import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { LoadMore, usePaged } from "@/lib/paged";
import { cn, fmtDate } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import type { OutreachMessage } from "@/lib/types";
import { Avatar, Badge, DataTable, EmptyState, FilterChips, Modal, Spinner, Td, Th } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";

const TONE: Record<string, "warn" | "good" | "bad" | "neutral" | "info"> = { queued: "warn", sending: "warn", sent: "good", failed: "bad", cancelled: "neutral", approved: "info", awaiting_approval: "warn" };
const FILTERS = [["all", "All"], ["sent", "Sent"], ["approved", "Waiting for Cowork"], ["failed", "Failed"], ["cancelled", "Cancelled"]] as const;
const CHANNEL: Record<string, string> = { email: "Email", linkedin: "LinkedIn", whatsapp: "WhatsApp" };

/** One message as the candidate got it (or will get it, for LinkedIn notes waiting for Cowork). */
function MessagePreview({ m, onClose }: { m: OutreachMessage; onClose: () => void }) {
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`${CHANNEL[m.channel] ?? m.channel}${m.kind === "follow_up" ? " follow-up" : ""} to ${m.candidateName}`} description={m.toAddress}>
      <div className="grid gap-2">
        {m.subject && <p className="text-sm font-medium">{m.subject}</p>}
        <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary/60 p-3 text-sm">{m.body}</p>
        {m.error && <p className="text-sm text-destructive">{m.error}</p>}
      </div>
    </Modal>
  );
}

/** Every message someone sent from a role page: email, WhatsApp and LinkedIn notes. Nothing here is sent automatically. */
export default function Outreach() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [open, setOpen] = useState<OutreachMessage | null>(null);
  // Counts per status and the pause switch come from a one-row request; the list itself is paged.
  const summary = useQuery({ queryKey: ["outreach", "all", "summary"], queryFn: () => call(rpc.outreach.$get({ query: { limit: "1" } })) });
  const counts: Partial<Record<string, number>> = summary.data?.counts ?? {};
  const count = (f: string) => (f === "all" ? Object.values(counts).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0 : counts[f] ?? 0);
  const q = usePaged(
    ["outreach", "all", filter],
    (before) => call(rpc.outreach.$get({ query: { ...(filter === "all" ? {} : { status: filter }), ...(before ? { before } : {}) } })),
    (p) => p.messages,
    { enabled: !!summary.data },
  );
  const rows = q.rows;
  const sentToday = summary.data?.sentToday ?? 0;
  const on = !!summary.data?.autoSendEnabled;

  return (
    <>
      <PageHeader title="Outreach" />

      {summary.data && (
        <Card className="mb-6 flex-row flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <div className="min-w-56 flex-1">
            <div className="flex items-baseline gap-1.5"><span className="num text-2xl font-semibold">{sentToday}</span><span className="text-sm text-muted-foreground">email{sentToday === 1 ? "" : "s"} sent today</span></div>
            <p className="text-xs text-muted-foreground">Messages go out only when someone presses Contact on a role page.</p>
          </div>
          <Link to="/settings" className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm", on ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
            <span className={cn("size-2 rounded-full", on ? "bg-success" : "bg-destructive")} />
            {on ? "Email sending on" : "Email sending paused"}
          </Link>
        </Card>
      )}

      <FilterChips label="Filter messages" options={FILTERS.map(([k, l]) => ({ key: k, label: l, count: count(k) }))} value={filter} onChange={(k) => setFilter(k as typeof filter)} />

      {summary.isLoading || q.isLoading ? <Spinner /> : rows.length ? (
        <>
        <DataTable>
          <TableHeader><TableRow><Th>Candidate</Th><Th>Role</Th><Th>Channel</Th><Th>Status</Th><Th>Sent</Th><Th>Follow up</Th></TableRow></TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => setOpen(m)}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={m.candidateName} size="sm" />
                    <div><div className="font-medium">{m.candidateName}</div><div className="text-xs text-muted-foreground">#{m.rank ?? "–"} · {m.score ?? "–"}</div></div>
                  </div>
                </Td>
                <Td><Link className="hover:underline" to={`/roles/${m.requestId}`} onClick={(e) => e.stopPropagation()}>{m.roleTitle}</Link></Td>
                <Td className="text-xs">{CHANNEL[m.channel] ?? m.channel}{m.kind === "follow_up" ? " · follow-up" : ""}</Td>
                <Td><Badge tone={TONE[m.status] ?? "neutral"} className="capitalize">{m.status === "approved" ? "waiting for Cowork" : m.status.replace("_", " ")}</Badge></Td>
                <Td className="num text-xs">{fmtDate(m.sentAt)}</Td>
                <Td className="num text-xs">{fmtDate(m.followUpDate)}</Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
        <LoadMore shown={rows.length} total={q.total} hasMore={q.hasNextPage} loading={q.isFetchingNextPage} onMore={() => q.fetchNextPage()} />
        </>
      ) : <EmptyState title={count("all") ? "Nothing here" : "No messages yet"}>{count("all") ? null : "Open a role and press Contact on a candidate to send the first one."}</EmptyState>}
      {open && <MessagePreview key={open.id} m={open} onClose={() => setOpen(null)} />}
    </>
  );
}
