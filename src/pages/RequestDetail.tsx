import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { can, useMe } from "@/lib/auth";
import type { RequestEvent, RequestRow } from "@/lib/types";
import { cn, fmtDate, fmtDateTime, money } from "@/lib/utils";
import { RequestStatusBadge } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, DeptDot, Field, FormError, Spinner, useToast } from "@/components/kit";
import { COMMENT_MAX, DecisionInput } from "../../shared/schemas";
import { Card } from "@/components/ui/card";
import { Discussion } from "@/components/Discussion";
import { Textarea } from "@/components/ui/textarea";

function Chips({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-sm text-muted-foreground">None</span>;
  return <div className="flex flex-wrap gap-1.5">{items.map((x) => <Badge key={x}>{x}</Badge>)}</div>;
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
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
  const length = (form.watch("comment") ?? "").length;
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
    <Card className="gap-3 border-primary/30 p-5">
      <h2 className="font-semibold">Your decision</h2>
      <Button disabled={isSubmitting} onClick={() => decide("approve")}>Approve and start sourcing</Button>
      <Field label="Comment" hint={length > COMMENT_MAX - 200 ? `${length} / ${COMMENT_MAX} characters` : "Needed to send back or reject."} htmlFor="dc" error={errors.comment?.message}>
        <Textarea id="dc" rows={3} dir="auto" maxLength={COMMENT_MAX} aria-invalid={!!errors.comment} {...form.register("comment")} />
      </Field>
      <FormError>{errors.root?.message}</FormError>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={isSubmitting} onClick={() => decide("request_changes")}>Request changes</Button>
        <Button variant="outline" className="text-destructive" disabled={isSubmitting} onClick={() => decide("reject")}>Reject</Button>
      </div>
    </Card>
  );
}

/** Real events as done steps, plus the step the request is waiting on now. */
function Timeline({ r, events }: { r: RequestRow; events: RequestEvent[] }) {
  // Oldest first, so the timeline reads top to bottom and ends with the step it is waiting on.
  const done = events.filter((e) => e.action !== "edited").slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const next = r.status === "submitted" ? "Waiting for Khalil" : r.status === "sourcing" ? "Finding candidates" : r.status === "changes_requested" ? "Waiting for changes" : r.status === "draft" ? "Not submitted yet" : null;
  return (
    <Card className="gap-3 p-5">
      <h2 className="font-semibold">Timeline</h2>
      <ol className="relative grid gap-4 border-l pl-5">
        {done.map((e) => (
          <li key={e.id} className="relative text-sm">
            <span aria-hidden className={cn("absolute -left-[25px] top-1 size-2.5 rounded-full ring-4 ring-card", e.action === "Rejected" ? "bg-destructive" : e.action === "Requested changes" ? "bg-chip-amber" : "bg-success")} />
            <div className="font-medium">{e.action}</div>
            <div className="text-xs text-muted-foreground">{e.actorName} · {fmtDateTime(e.createdAt)}</div>
            {e.comment && <p dir="auto" className="mt-1 whitespace-pre-line break-words rounded-md bg-secondary/70 px-2.5 py-1.5 text-start text-muted-foreground">{e.comment}</p>}
          </li>
        ))}
        {next && (
          <li className="relative text-sm">
            <span aria-hidden className="absolute -left-[25px] top-1 size-2.5 rounded-full bg-card ring-2 ring-primary" />
            <div className="font-medium text-primary">{next}</div>
          </li>
        )}
      </ol>
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
      <Link to={isCeo ? "/approvals" : "/requests"} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {isCeo ? "Approvals" : "Requests"}</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{r.code}</span><span aria-hidden>·</span><DeptDot name={r.department} />
            {r.requesterName && <><span aria-hidden>·</span><span>Requested by {r.requesterName}</span></>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{r.title}</h1>
            <RequestStatusBadge status={r.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canSeeRole && <Button asChild variant="outline" size="sm"><Link to={`/roles/${r.id}`}><Users /> Candidates</Link></Button>}
          {canEdit && <Button asChild variant="outline" size="sm"><Link to={`/requests/${r.id}/edit`}>Edit</Link></Button>}
          {r.requesterId === me.id && r.status === "draft" && <Button size="sm" onClick={submitDraft}>Submit to Khalil</Button>}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="gap-6 p-6 lg:col-span-2">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Fact k="Level">{r.seniority || "–"}</Fact>
            <Fact k="Headcount">{r.headcount} · {r.kind === "backfill" ? "Backfill" : "New role"}</Fact>
            <Fact k="Start">{fmtDate(r.startDate)}</Fact>
            <Fact k="Location">{r.locationPolicy}</Fact>
            <Fact k="Salary">{money(r.salaryMin, r.salaryMax, r.currency, r.salaryPeriod)}</Fact>
            <Fact k="Hiring manager">{r.hiringManagerName ?? "–"}</Fact>
          </dl>

          {r.justification && (
            <Section title="Why this role is needed">
              <blockquote className="flex gap-3 rounded-lg border-l-[3px] border-primary bg-accent/60 p-4 text-sm">
                {r.requesterName && <Avatar name={r.requesterName} size="sm" />}
                <p className="whitespace-pre-line">{r.justification}</p>
              </blockquote>
            </Section>
          )}

          <Section title="Requirements">
            <div className="grid gap-3 text-sm">
              <div><div className="mb-1 text-xs text-muted-foreground">Must-haves</div><Chips items={r.mustHaves} /></div>
              {!!r.niceToHaves.length && <div><div className="mb-1 text-xs text-muted-foreground">Nice-to-haves</div><Chips items={r.niceToHaves} /></div>}
              {!!r.dealBreakers.length && <div><div className="mb-1 text-xs text-muted-foreground">Deal-breakers</div><Chips items={r.dealBreakers} /></div>}
              {!!r.targetCompanies.length && <div><div className="mb-1 text-xs text-muted-foreground">Target companies</div><Chips items={r.targetCompanies} /></div>}
              {!!r.avoidCompanies.length && <div><div className="mb-1 text-xs text-muted-foreground">Avoid</div><Chips items={r.avoidCompanies} /></div>}
              <div className="text-muted-foreground">
                {r.minYears ?? "?"}+ years{r.idealYears ? `, ideally ${r.idealYears}` : ""}
                {r.languages.length ? ` · ${r.languages.join(", ")}` : ""}
                {r.timeZone ? ` · ${r.timeZone}` : ""}
                {r.workingHours ? ` · ${r.workingHours}` : ""}
                {r.searchLocations.length ? ` · searching ${r.searchLocations.join(", ")}` : ""}
              </div>
            </div>
          </Section>

          {r.jdText && (
            <Section title="Job description">
              <p className="whitespace-pre-line text-sm text-muted-foreground">{r.jdText}</p>
            </Section>
          )}
        </Card>

        <div className="lg:col-span-2 lg:row-start-2">
          <Discussion requestId={r.id} meId={me.id} />
        </div>

        <div className="grid gap-5 lg:sticky lg:top-20 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-start">
          {isCeo && r.status === "submitted" && <DecisionForm requestId={r.id} />}
          <Timeline r={r} events={events} />
        </div>
      </div>
    </>
  );
}
