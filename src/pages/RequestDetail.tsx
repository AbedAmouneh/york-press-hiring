import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { can, useMe } from "@/lib/auth";
import { fmtDate, fmtDateTime, money } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { RequestStatusBadge } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { Badge, Field, FormError, Spinner, useToast } from "@/components/kit";
import { DecisionInput } from "../../shared/schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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

type Action = "approve" | "reject" | "request_changes";
const DONE: Record<Action, string> = {
  approve: "Approved. Sourcing has started.",
  reject: "Rejected. The manager has been notified.",
  request_changes: "Sent back with your comment.",
};

/** Khalil's approve / request changes / reject panel. A comment is required unless approving. */
function DecisionForm({ requestId }: { requestId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(DecisionInput), defaultValues: { action: "approve" as Action, comment: "" } });
  const { errors, isSubmitting } = form.formState;
  const decide = (action: Action) => {
    form.setValue("action", action);
    return form.handleSubmit(async (values) => {
      try {
        await call(rpc.requests[":id"].decision.$post({ param: { id: requestId }, json: { ...values, comment: values.comment || undefined } }));
        await qc.invalidateQueries();
        toast(DONE[values.action]);
      } catch (e) {
        form.setError("root", { message: (e as Error).message });
      }
    })();
  };
  return (
    <Card className="mb-5 border-2 border-primary/30">
      <CardHeader><CardTitle>Your decision</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        <Field label="Comment" hint="Required to reject or request changes." htmlFor="dc" error={errors.comment?.message}>
          <Textarea id="dc" aria-invalid={!!errors.comment} {...form.register("comment")} />
        </Field>
        <FormError>{errors.root?.message}</FormError>
        <div className="flex flex-wrap gap-2">
          <Button variant="brand" disabled={isSubmitting} onClick={() => decide("approve")}>Approve and start sourcing</Button>
          <Button variant="outline" disabled={isSubmitting} onClick={() => decide("request_changes")}>Request changes</Button>
          <Button variant="outline" className="text-destructive" disabled={isSubmitting} onClick={() => decide("reject")}>Reject</Button>
        </div>
        <p className="text-xs text-muted-foreground">Approving starts sourcing straight away: about 50 candidates are found and scored, the Top 10 are flagged and contacted from the department template.</p>
      </CardContent>
    </Card>
  );
}

export default function RequestDetail() {
  const { id = "" } = useParams();
  const me = useMe().data!.user!;
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["request", id], queryFn: () => call(rpc.requests[":id"].$get({ param: { id } })) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <p className="text-destructive">{(q.error as Error).message}</p>;
  const { request: r, events } = q.data!;
  const isCeo = can(me, "ceo");
  const canEdit = (r.requesterId === me.id && ["draft", "changes_requested"].includes(r.status)) || can(me, "admin", "recruiter");
  const canSeeRole = ["sourcing", "open", "closed"].includes(r.status);

  async function submitDraft() {
    try {
      await call(rpc.requests[":id"].submit.$post({ param: { id: r.id } }));
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

      {isCeo && r.status === "submitted" && <DecisionForm requestId={r.id} />}

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
              <Row k="Working hours">{r.workingHours || "—"}</Row>
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
