import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import type { CandidateDetail } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CandidateStatusBadge } from "./Status";
import { CANDIDATE_STATUSES, CRITERIA, DEFAULT_WEIGHTS } from "../../shared/types";
import { RoleCandidatePatch } from "../../shared/schemas";
import { Avatar, Badge, Field, FormError, Select, SidePanel, Spinner, useToast } from "@/components/kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const href = (u: string) => (u.startsWith("http") ? u : `https://${u}`);
const emptyToNull = (v: unknown) => (v === "" ? null : v);

/** Status, hiring manager decision, comment and follow-up date for one candidate. */
function TrackingForm({ detail: d, onSaved }: { detail: CandidateDetail; onSaved: () => void }) {
  const rc = d.roleCandidate;
  const form = useForm({
    resolver: zodResolver(RoleCandidatePatch),
    defaultValues: { status: rc.status, hmDecision: rc.hmDecision, hmComment: rc.hmComment ?? "", followUpDate: rc.followUpDate },
  });
  const { errors, isSubmitting } = form.formState;
  const save = form.handleSubmit(async (values) => {
    try {
      await call(rpc["role-candidates"][":id"].$patch({ param: { id: rc.id }, json: values }));
      onSaved();
    } catch (e) {
      form.setError("root", { message: (e as Error).message });
    }
  });
  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-medium">Your decision</h3>
      <div>
        <form onSubmit={save} className="grid gap-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            {d.isRecruiter && (
              <Field label="Status" htmlFor="st">
                <Select id="st" {...form.register("status")}>
                  {CANDIDATE_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </Select>
              </Field>
            )}
            <Field label="HM decision" htmlFor="hmd">
              <Select id="hmd" {...form.register("hmDecision", { setValueAs: emptyToNull })}>
                <option value="">—</option><option value="yes">Yes</option><option value="maybe">Maybe</option><option value="no">No</option>
              </Select>
            </Field>
            {d.isRecruiter && (
              <Field label="Follow-up date" htmlFor="fu">
                <Input id="fu" type="date" {...form.register("followUpDate", { setValueAs: emptyToNull })} />
              </Field>
            )}
          </div>
          <Field label="HM comment" htmlFor="hmc" error={errors.hmComment?.message}>
            <Textarea id="hmc" aria-invalid={!!errors.hmComment} {...form.register("hmComment")} />
          </Field>
          <FormError>{errors.root?.message}</FormError>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Contacted {fmtDate(rc.dateContacted)}</span>
            <Button size="sm" type="submit" disabled={isSubmitting}>Save</Button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function CandidateSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["rc", id], queryFn: () => call(rpc["role-candidates"][":id"].$get({ param: { id: id! } })), enabled: !!id });
  const [busy, setBusy] = useState(false);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["rc", id] }); onChanged(); };

  async function reveal() {
    setBusy(true);
    try {
      const res = await call(rpc["role-candidates"][":id"].reveal.$post({ param: { id: id! } }));
      const pending = "pending" in res && res.pending;
      const found = "already" in res || ("found" in res && res.found);
      toast(pending ? "Requested from SignalHire. Results usually arrive within a minute." : found ? "Contact details found." : "SignalHire had no contact details for this person.");
      refresh();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function messageAction(mid: string, action: "approve" | "cancel" | "sent") {
    try {
      await call(rpc.outreach[":id"][action].$post({ param: { id: mid } }));
      toast(action === "approve" ? "Approved. It goes out from your LinkedIn in the next Cowork session." : action === "sent" ? "Marked as sent." : "Cancelled.");
      refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  const d = q.data;
  const weights = d?.request.scorecardWeights ?? DEFAULT_WEIGHTS;
  const label = "mb-1 text-xs font-medium text-muted-foreground";
  return (
    <SidePanel open={!!id} onOpenChange={(o) => !o && onClose()} title={d ? `#${d.roleCandidate.rank ?? "–"} for ${d.request.title}` : "Candidate"}>
      {!d ? <Spinner /> : (
        <div className="grid gap-5">
          <div className="flex items-start gap-3">
            <Avatar name={d.candidate.fullName} className="size-11 text-sm" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-tight">{d.candidate.fullName}</h2>
              <p className="text-sm text-muted-foreground">{d.candidate.headline}</p>
              <p className="text-sm text-muted-foreground">{d.candidate.location}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <CandidateStatusBadge status={d.roleCandidate.status} />
                {d.roleCandidate.isTop10 && <Badge tone="brand">Top 10</Badge>}
                {d.candidate.openToWork && <Badge tone="good">Open to work</Badge>}
                {d.candidate.isSample && <Badge tone="warn">Sample data</Badge>}
                {d.candidate.linkedinUrl && <a className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" href={href(d.candidate.linkedinUrl)} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> LinkedIn</a>}
              </div>
            </div>
            <div className="text-right">
              <div className="num text-3xl font-semibold leading-none">{d.roleCandidate.score ?? "–"}</div>
              <div className="text-xs text-muted-foreground">of 100</div>
            </div>
          </div>

          <Tabs defaultValue="overview" className="gap-4">
            <TabsList variant="line" className="w-full justify-start gap-2 border-b pb-1 [&>button]:flex-none [&>button]:px-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="experience">Experience</TabsTrigger>
              <TabsTrigger value="outreach">Contact & outreach</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="grid gap-5">
              <section>
                <h3 className={label}>Score breakdown</h3>
                <div className="grid gap-2">
                  {CRITERIA.map((c) => {
                    const v = d.roleCandidate.scoreBreakdown?.[c.key] ?? 0;
                    const max = weights[c.key] || 1;
                    return (
                      <div key={c.key} className="grid grid-cols-[1fr_120px_48px] items-center gap-3 text-sm">
                        <span>{c.label}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-secondary"><span className={cn("block h-full rounded-full", v / max >= 0.6 ? "bg-success" : "bg-chip-amber")} style={{ width: `${Math.round((v / max) * 100)}%` }} /></span>
                        <span className="num text-right text-muted-foreground">{v}/{weights[c.key]}</span>
                      </div>
                    );
                  })}
                </div>
                {d.roleCandidate.dealBreakerMissing && <p className="mt-2 text-sm text-destructive">A deal-breaker isn't met, so the score is capped at 40.</p>}
              </section>
              <section className="grid gap-3 text-sm">
                <div><h3 className={label}>Why recommended</h3>{d.roleCandidate.whyRecommended ?? "–"}</div>
                <div><h3 className={label}>Gaps</h3>{d.roleCandidate.gaps ?? "–"}</div>
                {d.roleCandidate.redFlags && <div><h3 className={label}>Red flags</h3><span className="text-destructive">{d.roleCandidate.redFlags}</span></div>}
              </section>
              {!!d.roleCandidate.webFindings?.length && (
                <section className="grid gap-1 text-sm">
                  <h3 className={label}>Found on the web</h3>
                  {d.roleCandidate.webFindings.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="underline">{f.finding}</a>)}
                </section>
              )}
              {d.canEdit && <TrackingForm key={d.roleCandidate.id} detail={d} onSaved={() => { toast("Saved."); refresh(); }} />}
            </TabsContent>

            <TabsContent value="experience" className="grid gap-5">
              <section>
                <h3 className={label}>{d.candidate.totalYears ?? "?"} years total{d.roleCandidate.relevantYears != null ? `, ${d.roleCandidate.relevantYears} relevant` : ""}</h3>
                <ol className="grid gap-3 border-l pl-4">
                  {d.candidate.experience.map((e, i) => (
                    <li key={i} className="relative text-sm">
                      <span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
                      <div className="font-medium">{e.title}</div>
                      <div className="text-muted-foreground">{e.company} · <span className="num">{e.start ?? "?"} – {e.end ?? (e.start ? "Present" : "?")}</span></div>
                      {e.summary && <div className="mt-0.5 text-xs text-muted-foreground">{e.summary}</div>}
                    </li>
                  ))}
                </ol>
              </section>
              {!!d.candidate.education.length && (
                <section className="text-sm">
                  <h3 className={label}>Education</h3>
                  {d.candidate.education.map((e, i) => <div key={i}>{[e.degree, e.field].filter(Boolean).join(", ")}{e.degree || e.field ? " · " : ""}{e.school}</div>)}
                </section>
              )}
              {!!(d.candidate.skills.length || d.candidate.languages.length) && (
                <section>
                  <h3 className={label}>Skills and languages</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {[...d.candidate.skills.slice(0, 20), ...d.candidate.certifications, ...d.candidate.languages].map((s) => <Badge key={s}>{s}</Badge>)}
                  </div>
                </section>
              )}
              <p className="text-xs text-muted-foreground">Found via {d.candidate.sources.join(" + ")}{d.otherRoles.length ? ` · also in ${d.otherRoles.map((o) => `${o.title} (${o.score ?? "–"})`).join(", ")}` : ""}</p>
            </TabsContent>

            <TabsContent value="outreach" className="grid gap-5">
              <section className="grid gap-2 text-sm">
                <h3 className={label}>Contact</h3>
                {d.candidate.email || d.candidate.phone ? (
                  <>
                    {d.candidate.email && <div className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" /><span>{d.candidate.email}</span></div>}
                    {d.candidate.phone && <div className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" /><span>{d.candidate.phone}</span></div>}
                    <p className="text-xs text-muted-foreground">From {d.candidate.contactSource ?? "–"} · {fmtDate(d.candidate.contactRetrievedAt)}</p>
                  </>
                ) : d.candidate.hasEmail ? (
                  <p className="text-muted-foreground">Visible to the recruiter and hiring manager.</p>
                ) : (
                  <>
                    <p className="text-muted-foreground">{d.reveals.some((r) => r.status === "pending") ? "Waiting for SignalHire…" : d.reveals.length ? "SignalHire had no contact details." : "Not revealed yet."}</p>
                    {d.isRecruiter && !d.reveals.some((r) => r.status === "pending") && <div><Button size="sm" variant="outline" disabled={busy} onClick={reveal}>Reveal with SignalHire · 1 credit</Button></div>}
                  </>
                )}
              </section>
              {d.messages.map((m) => (
                <section key={m.id} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{m.channel === "email" ? "Email" : "LinkedIn note"} <span className="font-normal text-muted-foreground">· {m.status.replace("_", " ")}</span></span>
                    <span className="text-xs text-muted-foreground">{m.sentAt ? `Sent ${fmtDate(m.sentAt)}` : `Queued ${fmtDate(m.queuedAt)}`}</span>
                  </div>
                  {m.subject && <p className="text-sm font-medium">{m.subject}</p>}
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.body}</p>
                  {d.isRecruiter && (
                    <div className="flex flex-wrap gap-2">
                      {m.status === "awaiting_approval" && <Button size="sm" onClick={() => messageAction(m.id, "approve")}>Approve LinkedIn message</Button>}
                      {m.status === "approved" && <Button size="sm" variant="outline" onClick={() => messageAction(m.id, "sent")}>Mark as sent</Button>}
                      {["queued", "awaiting_approval", "approved"].includes(m.status) && <Button size="sm" variant="ghost" onClick={() => messageAction(m.id, "cancel")}>Cancel</Button>}
                    </div>
                  )}
                </section>
              ))}
              {!d.messages.length && <p className="text-sm text-muted-foreground">No messages yet.</p>}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </SidePanel>
  );
}
