import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { api } from "@/lib/api";
import type { CandidateDetail } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CandidateStatusBadge } from "./Status";
import { CANDIDATE_STATUSES, CRITERIA, DEFAULT_WEIGHTS } from "../../shared/types";
import { Badge, Field, Select, SidePanel, Spinner, useToast } from "@/components/kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const href = (u: string) => (u.startsWith("http") ? u : `https://${u}`);

export function CandidateSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["rc", id], queryFn: () => api<CandidateDetail>(`/role-candidates/${id}`), enabled: !!id });
  const [form, setForm] = useState({ status: "new", hmDecision: "", hmComment: "", followUpDate: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data) {
      const rc = q.data.roleCandidate;
      setForm({ status: rc.status, hmDecision: rc.hmDecision ?? "", hmComment: rc.hmComment ?? "", followUpDate: rc.followUpDate ?? "" });
    }
  }, [q.data]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["rc", id] }); onChanged(); };

  async function save() {
    setBusy(true);
    try {
      await api(`/role-candidates/${id}`, { method: "PATCH", body: { ...form, hmDecision: form.hmDecision || null, followUpDate: form.followUpDate || null } });
      toast("Saved.");
      refresh();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function reveal() {
    setBusy(true);
    try {
      const res = await api<{ found?: boolean; pending?: boolean }>(`/role-candidates/${id}/reveal`, { method: "POST" });
      toast(res.pending ? "Requested from SignalHire. Results usually arrive within a minute." : res.found ? "Contact details found." : "SignalHire had no contact details for this person.");
      refresh();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function messageAction(mid: string, action: "approve" | "cancel" | "sent") {
    try {
      await api(`/outreach/${mid}/${action}`, { method: "POST" });
      toast(action === "approve" ? "Approved — it will be sent from your LinkedIn in the next Cowork session." : action === "sent" ? "Marked as sent." : "Cancelled.");
      refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  const d = q.data;
  const weights = d?.request.scorecardWeights ?? DEFAULT_WEIGHTS;
  return (
    <SidePanel open={!!id} onOpenChange={(o) => !o && onClose()} title={d ? `#${d.roleCandidate.rank ?? "—"} for ${d.request.title}` : "Candidate"}>
      {!d ? <Spinner /> : (
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold">{d.candidate.fullName}</h2>
              <p className="text-sm text-muted-foreground">{d.candidate.headline}</p>
              <p className="mt-1 text-sm">{d.candidate.location}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge>via {d.candidate.sources.join(" + ")}</Badge>
                {d.candidate.isSample && <Badge tone="warn">Sample data</Badge>}
                {d.candidate.openToWork && <Badge tone="good">Open to work</Badge>}
                {d.roleCandidate.isTop10 && <Badge tone="brand">Top 10</Badge>}
                <CandidateStatusBadge status={d.roleCandidate.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {d.candidate.linkedinUrl && <a className="inline-flex items-center gap-1 underline" href={href(d.candidate.linkedinUrl)} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> LinkedIn</a>}
                {d.candidate.otherUrls.map((u) => <a key={u} className="inline-flex items-center gap-1 underline" href={href(u)} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> {u.replace(/^https?:\/\//, "").slice(0, 30)}</a>)}
              </div>
            </div>
            <div className="text-right">
              <div className="num text-4xl font-bold leading-none">{d.roleCandidate.score ?? "—"}</div>
              <div className="text-xs text-muted-foreground">of 100</div>
            </div>
          </div>

          <Card>
            <CardHeader><CardTitle>Score breakdown</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {CRITERIA.map((c) => {
                const v = d.roleCandidate.scoreBreakdown?.[c.key] ?? 0;
                const max = weights[c.key] || 1;
                return (
                  <div key={c.key} className="grid grid-cols-[1fr_120px_48px] items-center gap-3 text-sm">
                    <span>{c.label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-secondary"><span className={cn("block h-full rounded-full", v / max >= 0.6 ? "bg-primary" : "bg-amber-500")} style={{ width: `${Math.round((v / max) * 100)}%` }} /></span>
                    <span className="num text-right">{v}/{weights[c.key]}</span>
                  </div>
                );
              })}
              {d.roleCandidate.dealBreakerMissing && <p className="text-sm text-destructive">A deal-breaker isn't met, so the score is capped at 40.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-3 pt-5 text-sm">
              <div><div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why recommended</div>{d.roleCandidate.whyRecommended ?? "—"}</div>
              <div><div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gaps</div>{d.roleCandidate.gaps ?? "—"}</div>
              <div><div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Red flags</div>{d.roleCandidate.redFlags || <span className="text-muted-foreground">None noted</span>}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Experience · {d.candidate.totalYears ?? "?"} yrs total{d.roleCandidate.relevantYears != null ? `, ${d.roleCandidate.relevantYears} relevant` : ""}</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              {d.candidate.experience.map((e, i) => (
                <div key={i} className="grid grid-cols-[110px_1fr] gap-3 text-sm">
                  <span className="num text-xs text-muted-foreground">{e.start ?? "?"} – {e.end ?? (e.start ? "Present" : "?")}</span>
                  <span><b>{e.title}</b><span className="block text-muted-foreground">{e.company}</span>{e.summary && <span className="mt-0.5 block text-xs text-muted-foreground">{e.summary}</span>}</span>
                </div>
              ))}
              {!!d.candidate.education.length && (
                <div className="border-t pt-3 text-sm">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Education</div>
                  {d.candidate.education.map((e, i) => <div key={i}>{[e.degree, e.field].filter(Boolean).join(", ")}{e.degree || e.field ? " · " : ""}{e.school}</div>)}
                </div>
              )}
              {!!(d.candidate.skills.length || d.candidate.languages.length) && (
                <div className="flex flex-wrap gap-1.5 border-t pt-3">
                  {[...d.candidate.skills.slice(0, 20), ...d.candidate.certifications, ...d.candidate.languages].map((s) => <Badge key={s}>{s}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>

          {!!d.roleCandidate.webFindings?.length && (
            <Card>
              <CardHeader><CardTitle>Found on the web</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {d.roleCandidate.webFindings.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="underline">{f.finding}</a>)}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {d.candidate.email || d.candidate.phone ? (
                <>
                  {d.candidate.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4" /><span className="font-mono">{d.candidate.email}</span></div>}
                  {d.candidate.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" /><span className="font-mono">{d.candidate.phone}</span></div>}
                  <p className="text-xs text-muted-foreground">Source: {d.candidate.contactSource ?? "—"} · retrieved {fmtDate(d.candidate.contactRetrievedAt)}</p>
                </>
              ) : d.candidate.hasEmail ? (
                <p className="text-muted-foreground">Contact details are visible to the recruiter and the hiring manager.</p>
              ) : (
                <>
                  <p className="text-muted-foreground">{d.reveals.some((r) => r.status === "pending") ? "Waiting for SignalHire…" : d.reveals.length ? "SignalHire had no contact details for this person." : "Not revealed. Contacts are revealed automatically for the Top 10."}</p>
                  {d.isRecruiter && !d.reveals.some((r) => r.status === "pending") && <div><Button size="sm" variant="outline" disabled={busy} onClick={reveal}>Reveal with SignalHire · 1 credit</Button></div>}
                </>
              )}
            </CardContent>
          </Card>

          {d.messages.map((m) => (
            <Card key={m.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{m.channel === "email" ? "Email" : "LinkedIn note"} · {m.status.replace("_", " ")}</CardTitle>
                <span className="text-xs text-muted-foreground">{m.sentAt ? `Sent ${fmtDate(m.sentAt)}` : `Queued ${fmtDate(m.queuedAt)}`}</span>
              </CardHeader>
              <CardContent className="grid gap-2">
                {m.subject && <p className="text-sm"><b>Subject:</b> {m.subject}</p>}
                <pre className="whitespace-pre-wrap rounded-md border bg-secondary/40 p-3 font-sans text-sm">{m.body}</pre>
                {d.isRecruiter && (
                  <div className="flex flex-wrap gap-2">
                    {m.status === "awaiting_approval" && <Button size="sm" onClick={() => messageAction(m.id, "approve")}>Approve LinkedIn message</Button>}
                    {m.status === "approved" && <Button size="sm" variant="outline" onClick={() => messageAction(m.id, "sent")}>Mark as sent</Button>}
                    {["queued", "awaiting_approval", "approved"].includes(m.status) && <Button size="sm" variant="ghost" onClick={() => messageAction(m.id, "cancel")}>Cancel</Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {d.canEdit && (
            <Card>
              <CardHeader><CardTitle>Tracking</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  {d.isRecruiter && (
                    <Field label="Status" htmlFor="st">
                      <Select id="st" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {CANDIDATE_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                      </Select>
                    </Field>
                  )}
                  <Field label="HM decision" htmlFor="hmd">
                    <Select id="hmd" value={form.hmDecision} onChange={(e) => setForm({ ...form, hmDecision: e.target.value })}>
                      <option value="">—</option><option value="yes">Yes</option><option value="maybe">Maybe</option><option value="no">No</option>
                    </Select>
                  </Field>
                  {d.isRecruiter && <Field label="Follow-up date" htmlFor="fu"><Input id="fu" type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} /></Field>}
                </div>
                <Field label="HM comment" htmlFor="hmc"><Textarea id="hmc" value={form.hmComment} onChange={(e) => setForm({ ...form, hmComment: e.target.value })} /></Field>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Contacted {fmtDate(d.roleCandidate.dateContacted)}</span>
                  <Button size="sm" disabled={busy} onClick={save}>Save</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!!d.otherRoles.length && (
            <p className="text-xs text-muted-foreground">Also in: {d.otherRoles.map((o) => `${o.title} (${o.score ?? "—"})`).join(", ")}</p>
          )}
        </div>
      )}
    </SidePanel>
  );
}
