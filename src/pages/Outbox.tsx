import { useState } from "react";
import { call, rpc } from "@/lib/rpc";
import { LoadMore, usePaged } from "@/lib/paged";
import type { OutboxEmail } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Badge, DataTable, EmptyState, Modal, Spinner, Td, Th } from "@/components/kit";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";


export default function Outbox() {
  const q = usePaged(["outbox"], (before) => call(rpc.outbox.$get({ query: before ? { before } : {} })), (p) => p.emails);
  const [open, setOpen] = useState<OutboxEmail | null>(null);
  return (
    <>
      <PageHeader title="Sent emails" />
      {q.first?.mock && (
        <p role="status" className="mb-4 rounded-lg bg-chip-amber/15 px-4 py-2.5 text-sm">
          <b>Mock mode.</b> Emails are kept here; nothing is sent.
        </p>
      )}
      {q.isLoading ? <Spinner /> : q.rows.length ? (
        <>
        <DataTable>
          <TableHeader><TableRow><Th>When</Th><Th>To</Th><Th>Subject</Th><Th>Type</Th><Th>Status</Th></TableRow></TableHeader>
          <TableBody>
            {q.rows.map((e) => (
              <TableRow key={e.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => setOpen(e)}>
                <Td className="num whitespace-nowrap text-xs">{fmtDateTime(e.createdAt)}</Td>
                <Td className="text-xs text-muted-foreground">{e.toAddress}</Td>
                <Td>{e.subject}</Td>
                <Td><Badge>{e.kind}</Badge></Td>
                <Td><Badge tone={e.status === "failed" ? "bad" : e.mock ? "warn" : "good"}>{e.mock ? "mock" : e.status}</Badge></Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
        <LoadMore shown={q.rows.length} total={q.total} hasMore={q.hasNextPage} loading={q.isFetchingNextPage} onMore={() => q.fetchNextPage()} />
        </>
      ) : <EmptyState title="No emails yet" />}
      <Modal open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.subject ?? ""} description={open ? `From ${open.fromAddress} to ${open.toAddress}${open.replyTo ? ` · replies to ${open.replyTo}` : ""}` : ""}>
        <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-secondary/40 p-3 font-sans text-sm">{open?.body}</pre>
        {open?.error && <p className="text-sm text-destructive">{open.error}</p>}
      </Modal>
    </>
  );
}
