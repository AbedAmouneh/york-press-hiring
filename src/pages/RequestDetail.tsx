import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";
import { api } from "@/lib/api";
import { can, useMe } from "@/lib/auth";
import type { RequestRow } from "@/lib/types";
import { fmtDate, fmtDateTime, money } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { RequestStatusBadge } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { Badge, Spinner, useToast } from "@/components/kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Ev = { id: string; actorName: string; action: string; comment: string | null; createdAt: string };

function Chips({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-muted-foreground">None</span>;
  return <div className="flex flex-wrap gap-1.5">{items.map((x) => <Badge key={x}>{x}</Badge>)}</div>;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-1.5 sm:grid-cols-[150px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{k}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default function RequestDetail() {
  const { id } = useParams();
  const me = useMe().data!.user!;
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["request", id], queryFn: () => api<{ request: RequestRow; events: Ev[] }>(`/requests/${id}`) });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <p className="text-destructive">{(q.error as Error).message}</p>;
  const { request: r, events } = q.data!;
  const isCeo = can(me, "ceo");
  const canEdit = (r.requesterId === me.id && ["draft", "changes_requested"].includes(r.status)) || can(me, "admin", "recruiter");
  const canSeeRole = ["sourcing", "open", "closed"].includes(r.status);

  async function decide(action: "approve" | "reject" | "request_changes") {
    if (action !== "approve" && !comment.trim()) return toast("Add a comment so the manager knows why.", "error");
    setBusy(true);
    try {
      await api(`/requests/${r.id}/decision`, { body: { action, comment: comment.trim() || undefined } });
      await qc.invalidateQueries();
      toast(action === "approve" ? "Approved. Sourcing has started." : action === "reject" ? "Rejected. The manager has been notified." : "Sent back with your comment.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft() {
    try {
      await api(`/requests/${r.id}/submit`, { method: "POST" });
      await qc.invalidateQueries();
      toast("Submitted. Khalil has been notified.");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <>
      <Link to={isCeo ? "/approvals" : "/requests"} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <PageHeader eyebrow={`${r.code} · ${r.department}`} title={r.title}>
        <RequestStatusBadge status={r.status} />
        {canSeeRole && <Button asChild variant="outline"><Link to={`/roles/${r.id}`}><Users /> Candidates</Link></Button>}
        {canEdit && <Button asChild variant="outline"><Link to={`/requests/${r.id}/edit`}>Edit</Link></Button>}
        {r.requesterId === me.id && r.status === "draft" && <Button onClick={submitDraft}>Submit to Khalil</Button>}
      </PageHeader>

      {isCeo && r.status === "submitted" && (
        <Card className="mb-5 border-2 border-brand">
          <CardHeader><CardTitle>Your decision</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (required to reject or request changes)" aria-label="Comment" />
            <div className="flex flex-wrap gap-2">
              <Button variant="brand" disabled={busy} onClick={() => decide("approve")}>Approve and start sourcing</Button>
              <Button variant="outline" disabled={busy} onClick={() => decide("request_changes")}>Request changes</Button>
              <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => decide("reject")}>Reject</Button>
            </div>
            <p className="text-xs text-muted-foreground">Approving starts sourcing straight away: about 50 candidates are found and scored, the Top 10 are flagged and contacted from the department template.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Role</CardTitle></CardHeader>
          <CardContent>
            <dl>
              <Row k="Seniority">{r.seniority}</Row>
              <Row k="Headcount">{r.headcount}</Row>
              <Row k="Type">{r.kind === "backfill" ? "Backfill" : "New role"}</Row>
              <Row k="Target start">{fmtDate(r.startDate)}</Row>
              <Row k="Location">{r.locationPolicy}{r.searchLocations.length ? ` · searching ${r.searchLocations.join(", ")}` : ""}</Row>
              <Row k="Time zone">{r.timeZone || "Flexible"}</Row>
              <Row k="Languages">{r.languages.join(", ") || "—"}</Row>
              <Row k="Salary">{money(r.salaryMin, r.salaryMax, r.currency, r.salaryPeriod)}</Row>
              <Row k="Requested by">{r.requesterName}</Row>
              <Row k="Hiring manager">{r.hiringManagerName ?? "—"}</Row>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Requirements</CardTitle></CardHeader>
          <CardContent>
            <dl>
              <Row k="Must-haves"><Chips items={r.mustHaves} /></Row>
              <Row k="Nice-to-haves"><Chips items={r.niceToHaves} /></Row>
              <Row k="Deal-breakers"><Chips items={r.dealBreakers} /></Row>
              <Row k="Experience">{r.minYears ?? "?"}+ years{r.idealYears ? `, ideally ${r.idealYears}` : ""}</Row>
              <Row k="Target companies"><Chips items={r.targetCompanies} /></Row>
              <Row k="Avoid"><Chips items={["York Press", ...r.avoidCompanies]} /></Row>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Job description</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p className="whitespace-pre-line">{r.jdText || <span className="text-muted-foreground">Not provided</span>}</p>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business justification</div>
              <p className="whitespace-pre-line">{r.justification || "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>History</CardTitle></CardHeader>
          <CardContent>
            <ol className="grid gap-3">
              {events.filter((e) => e.action !== "edited").map((e) => (
                <li key={e.id} className="grid grid-cols-[110px_1fr] gap-3 text-sm">
                  <span className="num text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
                  <span><b>{e.actorName}</b> · {e.action}{e.comment && <span className="mt-0.5 block text-muted-foreground">{e.comment}</span>}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
