import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Flag, RefreshCw, Sparkles } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { can, useMe } from "@/lib/auth";
import { stageOf } from "@/lib/home";
import type { CandidateRow, RequestRow } from "@/lib/types";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { CandidateStatusBadge, OutreachBadge, RequestStatusBadge } from "@/components/Status";
import { CandidateSheet } from "@/components/CandidateSheet";
import { StageBar } from "@/components/StageBar";
import { Button } from "@/components/ui/button";
import { CANDIDATE_STATUSES, CRITERIA, DEFAULT_WEIGHTS, type HmDecision, type Weights } from "../../shared/types";
import { Avatar, Badge, DataTable, DeptDot, EmptyState, Modal, ScoreBar, Select, Spinner, Stat, Td, Th, useToast } from "@/components/kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const DECISION_STYLE: Record<string, string> = { yes: "bg-success/15 text-success", maybe: "bg-chip-amber/30 text-warning", no: "bg-destructive/10 text-destructive" };

function CandidateTable({ rows, onOpen, canEdit, onDecision, top }: { rows: CandidateRow[]; onOpen: (id: string) => void; canEdit: boolean; onDecision: (id: string, d: HmDecision | null) => void; top: boolean }) {
  if (!rows.length) return <EmptyState title="No candidates match">Try a different filter.</EmptyState>;
  return (
    <DataTable>
      <TableHeader>
        <TableRow><Th className="w-10">#</Th><Th>Candidate</Th><Th>Current role</Th><Th>Score</Th><Th>Status</Th><Th>HM decision</Th><Th>{top ? "Outreach" : "Location"}</Th></TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => onOpen(c.id)}>
            <Td className="num align-middle text-muted-foreground">{c.rank ?? "–"}</Td>
            <Td className="min-w-[220px]">
              <div className="flex items-center gap-2.5">
                <Avatar name={c.fullName} />
                <div className="min-w-0">
                  <div className="font-medium">
                    {c.fullName}
                    {c.redFlags && <Flag className="ml-1.5 inline size-3.5 text-destructive" aria-label="Red flag" />}
                    {c.newContender && <Badge tone="brand" className="ml-2">New</Badge>}
                    {c.isSample && <Badge className="ml-2">Sample</Badge>}
                  </div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{c.headline}</div>
                </div>
              </div>
            </Td>
            <Td className="min-w-[160px]"><div>{c.currentTitle ?? "—"}</div><div className="text-xs text-muted-foreground">{c.currentCompany}</div></Td>
            <Td><ScoreBar value={c.score} /></Td>
            <Td><CandidateStatusBadge status={c.status} /></Td>
            <Td onClick={(e) => e.stopPropagation()}>
              {canEdit ? (
                <div className="inline-flex gap-0.5 rounded-lg bg-secondary p-0.5">
                  {(["yes", "maybe", "no"] as const).map((d) => (
                    <button key={d} onClick={() => onDecision(c.id, c.hmDecision === d ? null : d)} aria-pressed={c.hmDecision === d}
                      className={cn("rounded-md px-2 py-0.5 text-xs capitalize transition-colors", c.hmDecision === d ? DECISION_STYLE[d] + " font-semibold" : "text-muted-foreground hover:bg-card hover:text-foreground")}>
                      {d}
                    </button>
                  ))}
                </div>
              ) : c.hmDecision ? <Badge className={cn("capitalize", DECISION_STYLE[c.hmDecision])}>{c.hmDecision}</Badge> : <span className="text-muted-foreground">–</span>}
            </Td>
            <Td className="text-xs">{top ? <OutreachBadge outreach={c.outreach} /> : <span className="text-muted-foreground">{c.location}</span>}</Td>
          </TableRow>
        ))}
      </TableBody>
    </DataTable>
  );
}

function WeightsEditor({ request, onSaved }: { request: RequestRow; onSaved: () => void }) {
  const toast = useToast();
  const [w, setW] = useState<Weights>(request.scorecardWeights ?? DEFAULT_WEIGHTS);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  async function save() {
    try {
      await call(rpc.requests[":id"].weights.$patch({ param: { id: request.id }, json: w }));
      toast("Weights saved and candidates re-ranked.");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
  return (
    <div className="grid gap-3">
      {CRITERIA.map((c) => (
        <div key={c.key} className="grid grid-cols-[1fr_140px_40px] items-center gap-3 text-sm">
          <label htmlFor={`w-${c.key}`}>{c.label}</label>
          <input id={`w-${c.key}`} type="range" min={0} max={50} value={w[c.key]} onChange={(e) => setW({ ...w, [c.key]: Number(e.target.value) })} className="accent-black" />
          <span className="num text-right font-semibold">{w[c.key]}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t pt-3">
        <span className={cn("num text-sm font-semibold", total === 100 ? "text-success" : "text-destructive")}>Total {total} / 100</span>
        <Button size="sm" disabled={total !== 100} onClick={save}>Save and re-rank</Button>
      </div>
    </div>
  );
}

export default function RoleDetail() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const me = useMe().data!.user!;
  const qc = useQueryClient();
  const toast = useToast();
  const isRecruiter = can(me, "recruiter", "admin");
  const tab = params.get("tab") ?? "top";
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState({ q: "", status: "", min: 0 });
  const [closing, setClosing] = useState(false);
  const [deleteContacts, setDeleteContacts] = useState(false);

  const req = useQuery({ queryKey: ["request", id], queryFn: () => call(rpc.requests[":id"].$get({ param: { id } })), refetchInterval: (q) => (q.state.data?.request.status === "sourcing" ? 3000 : false) });
  const runs = useQuery({ queryKey: ["runs", id], queryFn: () => call(rpc.requests[":id"].runs.$get({ param: { id } })), refetchInterval: (q) => (q.state.data?.runs.some((r) => ["queued", "running", "waiting"].includes(r.status)) ? 3000 : false) });
  const running = runs.data?.runs.find((r) => ["queued", "running", "waiting"].includes(r.status));
  const cands = useQuery({ queryKey: ["candidates", id], queryFn: () => call(rpc.requests[":id"].candidates.$get({ param: { id } })), refetchInterval: running ? 3000 : false });
  const apps = useQuery({ queryKey: ["applications", id], queryFn: () => call(rpc.requests[":id"].applications.$get({ param: { id } })), enabled: tab === "applications" });

  const all = useMemo(() => cands.data?.candidates ?? [], [cands.data]);
  const top = all.filter((c) => c.isTop10);
  const filtered = useMemo(() => all.filter((c) =>
    (!filter.q || `${c.fullName} ${c.currentTitle} ${c.currentCompany} ${c.location}`.toLowerCase().includes(filter.q.toLowerCase())) &&
    (!filter.status || c.status === filter.status) && (c.score ?? 0) >= filter.min), [all, filter]);

  if (req.isLoading) return <Spinner />;
  if (req.error) return <p className="text-destructive">{(req.error as Error).message}</p>;
  const r = req.data!.request;
  const lastRun = runs.data?.runs[0];

  async function decision(rcId: string, hmDecision: HmDecision | null) {
    await call(rpc["role-candidates"][":id"].$patch({ param: { id: rcId }, json: { hmDecision } }));
    qc.invalidateQueries({ queryKey: ["candidates", id] });
  }
  async function rerun() {
    try {
      await call(rpc.requests[":id"].runs.$post({ param: { id } }));
      toast("Refresh started. New profiles will appear as they're scored.");
      qc.invalidateQueries({ queryKey: ["runs", id] });
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function closeRole() {
    await call(rpc.requests[":id"].close.$post({ param: { id }, json: { deleteContacts } }));
    setClosing(false);
    toast("Role closed. Weekly refresh stopped.");
    qc.invalidateQueries();
  }
  function exportCsv() {
    const head = ["Rank", "Score", "Name", "Title", "Company", "Location", "Status", "HM decision", "Email", "LinkedIn", "Sources"];
    const rows = all.map((c) => [c.rank, c.score, c.fullName, c.currentTitle, c.currentCompany, c.location, c.status, c.hmDecision, c.email, c.linkedinUrl, c.sources.join("+")]);
    const csv = [head, ...rows].map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${r.code}-${r.title.replace(/\W+/g, "-")}-candidates.csv`;
    a.click();
  }

  return (
    <>
      <Link to="/roles" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Roles</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Link to={`/requests/${r.id}`} className="font-mono text-xs hover:text-foreground hover:underline" title="Open the request">{r.code}</Link>
            <span aria-hidden>·</span><DeptDot name={r.department} />
            <span aria-hidden>·</span><span>{r.locationPolicy}</span>
            {r.hiringManagerName && <><span aria-hidden>·</span><span>HM {r.hiringManagerName}</span></>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{r.title}</h1>
            <RequestStatusBadge status={r.status} />
          </div>
        </div>
        {isRecruiter && (
          <div className="flex items-center gap-2">
            {r.status !== "closed" && <Button variant="outline" size="sm" onClick={rerun} disabled={!!running}><RefreshCw /> Refresh</Button>}
            <Button variant="outline" size="icon-sm" onClick={exportCsv} disabled={!all.length} aria-label="Download CSV" title="Download CSV"><Download /></Button>
            {r.status !== "closed" && <Button variant="ghost" size="sm" onClick={() => setClosing(true)}>Close role</Button>}
          </div>
        )}
      </div>

      {running && (
        <div role="status" className="mb-4 flex items-center gap-2.5 rounded-lg bg-accent px-4 py-2.5 text-sm">
          <Spinner className="text-primary" />
          <span>Finding candidates · {running.state.log.at(-1)?.msg ?? "starting…"}</span>
        </div>
      )}
      {lastRun?.status === "failed" && !running && (
        <div role="alert" className="mb-4 rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">Last run failed: {lastRun.error}</div>
      )}

      <Card className="mb-6 flex-row flex-wrap items-center gap-x-10 gap-y-4 px-5 py-4">
        <Stat label="Screened" value={all.length} />
        <Stat label="Top 10 average" value={top.length ? Math.round(top.reduce((a, c) => a + (c.score ?? 0), 0) / top.length) : "–"} />
        <Stat label="Contacted" value={all.filter((c) => c.status !== "new").length} />
        <Stat label="HM yes" value={all.filter((c) => c.hmDecision === "yes").length} />
        <div className="ml-auto flex items-center gap-6">
          <StageBar stage={stageOf({ status: r.status, stats: { contacted: all.filter((c) => c.status !== "new").length } })} />
          <div className="text-xs text-muted-foreground">Last run<div className="text-sm text-foreground">{lastRun ? fmtDate(lastRun.createdAt) : "–"}</div></div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-4">
        <TabsList variant="line" className="w-full justify-start gap-2 border-b pb-1 [&>button]:flex-none [&>button]:px-2">
          <TabsTrigger value="top">Top 10</TabsTrigger>
          <TabsTrigger value="all">All screened ({all.length})</TabsTrigger>
          <TabsTrigger value="applications">CVs received</TabsTrigger>
          <TabsTrigger value="runs">Runs & cost</TabsTrigger>
          <TabsTrigger value="brief">Scorecard & brief</TabsTrigger>
        </TabsList>
        <TabsContent value="top">
          {cands.isLoading ? <Spinner /> : top.length ? <CandidateTable rows={top} top onOpen={setOpen} canEdit={!!cands.data?.canEdit} onDecision={decision} /> : <EmptyState title={running ? "Candidates are being found and scored…" : "No candidates yet"} />}
        </TabsContent>
        <TabsContent value="all">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input className="w-64" placeholder="Search name, title, company" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} aria-label="Search" />
            <Select className="w-40" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="Status">
              <option value="">All statuses</option>
              {CANDIDATE_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </Select>
            <Select className="w-36" value={filter.min} onChange={(e) => setFilter({ ...filter, min: Number(e.target.value) })} aria-label="Minimum score">
              {[0, 50, 60, 70, 80].map((n) => <option key={n} value={n}>{n ? `Score ≥ ${n}` : "Any score"}</option>)}
            </Select>
            <span className="text-sm text-muted-foreground">{filtered.length} shown</span>
          </div>
          <CandidateTable rows={filtered} top={false} onOpen={setOpen} canEdit={!!cands.data?.canEdit} onDecision={decision} />
        </TabsContent>
        <TabsContent value="applications">
          {apps.isLoading ? <Spinner /> : apps.data?.applications.length ? (
            <DataTable>
              <TableHeader><TableRow><Th>Received</Th><Th>Name</Th><Th>Score</Th><Th>Assessment</Th><Th>CV</Th></TableRow></TableHeader>
              <TableBody>
                {apps.data.applications.map((a) => (
                  <TableRow key={a.id}>
                    <Td className="num whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</Td>
                    <Td><div className="font-medium">{a.name}</div><div className="text-xs text-muted-foreground">{a.email}</div></Td>
                    <Td><ScoreBar value={a.score} /></Td>
                    <Td className="max-w-md text-xs">{a.analysis?.why}{a.analysis?.gaps && <div className="mt-1 text-muted-foreground">Gaps: {a.analysis.gaps}</div>}</Td>
                    <Td>{a.email ? <a className="text-sm underline" href={`/api/applications/${a.id}/cv`}>{a.cvFileName}</a> : "—"}</Td>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          ) : (
            <EmptyState title="No CVs yet">
              Candidates upload CVs at the apply link included in every outreach email:
              <div className="mt-2 break-all font-mono text-xs">{window.location.origin}/apply/{r.applyToken}</div>
            </EmptyState>
          )}
        </TabsContent>
        <TabsContent value="runs">
          <div className="grid gap-4">
            {runs.data?.runs.map((run) => (
              <Card key={run.id}>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle>{run.kind} run · {fmtDateTime(run.createdAt)}</CardTitle>
                  <Badge tone={run.status === "done" ? "good" : run.status === "failed" ? "bad" : "brand"}>{run.status}</Badge>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span>Found <b className="num">{run.found}</b></span><span>Kept <b className="num">{run.kept}</b></span>
                    <span>New contenders <b className="num">{run.newContenders}</b></span><span>PDL records <b className="num">{run.pdlRecords}</b></span>
                    <span>SignalHire searches <b className="num">{run.signalhireSearches}</b></span><span>SignalHire credits <b className="num">{run.signalhireCredits}</b></span>
                    <span>Web searches <b className="num">{run.webSearches}</b> (${(run.webSearches / 100).toFixed(2)})</span>
                  </div>
                  <ol className="grid gap-1 border-l-2 pl-3 text-xs text-muted-foreground">
                    {run.state.log.map((l, i) => <li key={i}><span className="num">{fmtDateTime(l.at)}</span> — {l.msg}</li>)}
                  </ol>
                </CardContent>
              </Card>
            ))}
            {!runs.data?.runs.length && <EmptyState title="No runs yet" />}
          </div>
        </TabsContent>
        <TabsContent value="brief">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle><Sparkles className="mr-1 inline h-4 w-4" /> Search brief</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {runs.data?.runs.find((x) => x.state.brief)?.state.brief ? (() => {
                  const b = runs.data!.runs.find((x) => x.state.brief)!.state.brief!;
                  return (
                    <>
                      <p>{b.summary}</p>
                      <div><b>Titles:</b> {b.titles.join(", ")}</div>
                      <div><b>Skills:</b> {b.skills.join(", ")}</div>
                      <div><b>Keywords:</b> {b.keywords.join(", ")}</div>
                      <div><b>Countries:</b> {b.locations.length ? b.locations.join(", ") : "Global"}</div>
                      <div><b>Always excluded:</b> current York Press employees, people already screened, anyone on the do-not-contact list.</div>
                    </>
                  );
                })() : <p className="text-muted-foreground">Created when the first run starts.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Scorecard weights for this role</CardTitle></CardHeader>
              <CardContent>
                {isRecruiter ? <WeightsEditor request={r} onSaved={() => { qc.invalidateQueries({ queryKey: ["candidates", id] }); qc.invalidateQueries({ queryKey: ["request", id] }); }} /> : (
                  <ul className="grid gap-1 text-sm">{CRITERIA.map((c) => <li key={c.key} className="flex justify-between"><span>{c.label}</span><b className="num">{(r.scorecardWeights ?? DEFAULT_WEIGHTS)[c.key]}</b></li>)}</ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <CandidateSheet id={open} onClose={() => setOpen(null)} onChanged={() => qc.invalidateQueries({ queryKey: ["candidates", id] })} />

      <Modal open={closing} onOpenChange={setClosing} title={`Close ${r.title}?`} description="Closing stops the weekly refresh and cancels any outreach that hasn't been sent.">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={deleteContacts} onChange={(e) => setDeleteContacts(e.target.checked)} className="mt-1" />
          <span>Also delete the email and phone numbers we collected for this role's candidates.</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setClosing(false)}>Keep open</Button>
          <Button variant="destructive" onClick={closeRole}>Close role</Button>
        </div>
      </Modal>
    </>
  );
}
