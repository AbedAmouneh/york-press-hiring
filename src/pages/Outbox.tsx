import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Badge, DataTable, EmptyState, Modal, Spinner, Td, Th } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";

type Email = { id: string; toAddress: string; fromAddress: string; replyTo: string | null; subject: string; body: string; kind: string; mock: boolean; status: string; error: string | null; createdAt: string };

export default function Outbox() {
  const q = useQuery({ queryKey: ["outbox"], queryFn: () => api<{ emails: Email[]; mock: boolean }>("/outbox") });
  const [open, setOpen] = useState<Email | null>(null);
  return (
    <>
      <PageHeader eyebrow="Every email the platform sent" title="Sent emails" />
      {q.data?.mock && (
        <Card className="mb-4 border-brand bg-accent px-4 py-3 text-sm">
          <b>Email is in mock mode.</b> Nothing leaves the app until a Resend API key is added; emails are kept here so you can read them.
        </Card>
      )}
      {q.isLoading ? <Spinner /> : q.data?.emails.length ? (
        <DataTable>
          <TableHeader><TableRow><Th>When</Th><Th>To</Th><Th>Subject</Th><Th>Type</Th><Th>Status</Th></TableRow></TableHeader>
          <TableBody>
            {q.data.emails.map((e) => (
              <TableRow key={e.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => setOpen(e)}>
                <Td className="num whitespace-nowrap text-xs">{fmtDateTime(e.createdAt)}</Td>
                <Td className="font-mono text-xs">{e.toAddress}</Td>
                <Td>{e.subject}</Td>
                <Td><Badge>{e.kind}</Badge></Td>
                <Td><Badge tone={e.status === "failed" ? "bad" : e.mock ? "warn" : "good"}>{e.mock ? "mock" : e.status}</Badge></Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      ) : <EmptyState title="No emails yet" />}
      <Modal open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.subject ?? ""} description={open ? `From ${open.fromAddress} to ${open.toAddress}${open.replyTo ? ` · replies to ${open.replyTo}` : ""}` : ""}>
        <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-secondary/40 p-3 font-sans text-sm">{open?.body}</pre>
        {open?.error && <p className="text-sm text-destructive">{open.error}</p>}
      </Modal>
    </>
  );
}
