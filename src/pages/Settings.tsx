import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn, fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardContent, CardHeader, CardTitle, Spinner, Switch, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CRITERIA, DEFAULT_WEIGHTS, DEPARTMENTS, type Weights } from "../../shared/types";

type SettingsData = {
  settings: { autoSendEnabled: boolean; dailySendCap: number; signalhireRevealEnabled: boolean; webSearchEnabled: boolean; weeklySummaryEnabled: boolean; defaultWeights: Weights | null; signalhireCreditsLeft: number | null };
  sentToday: number;
  integrations: { claude: { live: boolean; model: string }; pdl: { live: boolean }; signalhire: { live: boolean; creditsLeft: number | null }; email: { live: boolean; from: string }; database: { live: boolean }; appUrl: string };
};
type Template = { id: string; name: string; department: string | null; channel: "email" | "linkedin"; subject: string | null; body: string; active: boolean };

function Live({ live }: { live: boolean }) {
  return <Badge tone={live ? "good" : "warn"} dot>{live ? "Live" : "Mock mode"}</Badge>;
}

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="text-sm"><span className="font-medium">{label}</span><span className="block text-muted-foreground">{hint}</span></label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function General() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsData>("/settings") });
  const [cap, setCap] = useState("");
  const [w, setW] = useState<Weights>(DEFAULT_WEIGHTS);
  useEffect(() => { if (q.data) { setCap(String(q.data.settings.dailySendCap)); setW(q.data.settings.defaultWeights ?? DEFAULT_WEIGHTS); } }, [q.data]);
  if (!q.data) return <Spinner />;
  const s = q.data.settings;
  const i = q.data.integrations;
  async function patch(body: Record<string, unknown>, msg: string) {
    try {
      await api("/settings", { method: "PATCH", body });
      toast(msg);
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) { toast((e as Error).message, "error"); }
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className={cn(!s.autoSendEnabled && "border-destructive")}>
        <CardHeader><CardTitle>Sending</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow id="ks" label="Automatic email sending" hint="Turn off to pause every outreach email at once (kill switch)." checked={s.autoSendEnabled}
            onChange={(v) => patch({ autoSendEnabled: v }, v ? "Automatic sending is on." : "All sending paused.")} />
          <Field label="Daily send cap" hint={`Across all roles. Sent today: ${q.data.sentToday}.`} htmlFor="cap">
            <div className="flex gap-2">
              <Input id="cap" type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} />
              <Button variant="outline" onClick={() => patch({ dailySendCap: Number(cap) }, "Daily cap saved.")}>Save</Button>
            </div>
          </Field>
          <SwitchRow id="rv" label="Reveal Top-10 contacts with SignalHire" hint="Uses 1 credit per person found." checked={s.signalhireRevealEnabled} onChange={(v) => patch({ signalhireRevealEnabled: v }, "Saved.")} />
          <SwitchRow id="ws" label="Claude web search on the top 20" hint="Looks for portfolios, GitHub and publications ($10 per 1,000 searches)." checked={s.webSearchEnabled} onChange={(v) => patch({ webSearchEnabled: v }, "Saved.")} />
          <SwitchRow id="sum" label="Weekly summary for Khalil" hint="Monday 09:00 Beirut: open roles, pipeline and spend." checked={s.weeklySummaryEnabled} onChange={(v) => patch({ weeklySummaryEnabled: v }, "Saved.")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Connections</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex justify-between gap-2"><span>Claude API <span className="text-muted-foreground">· {i.claude.model}</span></span><Live live={i.claude.live} /></div>
          <div className="flex justify-between gap-2"><span>People Data Labs <span className="text-muted-foreground">· search</span></span><Live live={i.pdl.live} /></div>
          <div className="flex justify-between gap-2"><span>SignalHire <span className="text-muted-foreground">· search + contacts{i.signalhire.creditsLeft != null ? ` · ${i.signalhire.creditsLeft} credits left` : ""}</span></span><Live live={i.signalhire.live} /></div>
          <div className="flex justify-between gap-2"><span>Email (Resend) <span className="text-muted-foreground">· {i.email.from}</span></span><Live live={i.email.live} /></div>
          <div className="flex justify-between gap-2"><span>Database</span><Badge tone={i.database.live ? "good" : "warn"} dot>{i.database.live ? "Postgres" : "Local file"}</Badge></div>
          <div className="flex justify-between gap-2"><span>LinkedIn messaging</span><Badge tone="info">Claude in Chrome · approval required</Badge></div>
          <p className="text-xs text-muted-foreground">Add API keys in Vercel → Project → Settings → Environment Variables, then redeploy. See SETUP_GUIDE.md.</p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Default scorecard weights</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {CRITERIA.map((c) => (
            <div key={c.key} className="grid grid-cols-[1fr_180px_40px] items-center gap-3 text-sm">
              <label htmlFor={`dw-${c.key}`}>{c.label}</label>
              <input id={`dw-${c.key}`} type="range" min={0} max={50} value={w[c.key]} onChange={(e) => setW({ ...w, [c.key]: Number(e.target.value) })} className="accent-black" />
              <span className="num text-right font-semibold">{w[c.key]}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-3">
            <span className={cn("num text-sm font-semibold", total === 100 ? "text-success" : "text-destructive")}>Total {total} / 100</span>
            <Button size="sm" disabled={total !== 100} onClick={() => patch({ defaultWeights: w }, "Default weights saved. They apply to new roles.")}>Save</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Templates() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["templates"], queryFn: () => api<{ templates: Template[]; placeholders: string[] }>("/templates") });
  const [sel, setSel] = useState<string>("");
  const [draft, setDraft] = useState<Template | null>(null);
  useEffect(() => {
    const t = q.data?.templates.find((x) => x.id === sel) ?? q.data?.templates[0];
    if (t) { setSel(t.id); setDraft(t); }
  }, [q.data, sel]);
  if (!q.data || !draft) return <Spinner />;
  async function save() {
    try {
      await api(`/templates/${draft!.id}`, { method: "PATCH", body: { name: draft!.name, subject: draft!.subject, body: draft!.body, department: draft!.department, active: draft!.active } });
      toast("Template saved.");
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function addForDept(dept: string, channel: "email" | "linkedin") {
    const base = q.data!.templates.find((t) => t.channel === channel && !t.department)!;
    const res = await api<{ template: Template }>("/templates", { body: { name: `${dept} ${channel === "email" ? "email" : "LinkedIn note"}`, department: dept, channel, subject: base.subject, body: base.body } });
    await qc.invalidateQueries({ queryKey: ["templates"] });
    setSel(res.template.id);
  }
  const missingLi = DEPARTMENTS.filter((d) => !q.data!.templates.some((t) => t.channel === "linkedin" && t.department === d));
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit p-2">
        {q.data.templates.map((t) => (
          <button key={t.id} onClick={() => setSel(t.id)} className={cn("flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-secondary", t.id === sel && "bg-secondary font-semibold")}>
            <span>{t.name}</span>{!t.active && <Badge>off</Badge>}
          </button>
        ))}
        {!!missingLi.length && (
          <div className="mt-2 border-t p-2">
            <Select aria-label="Add a LinkedIn template for a department" value="" onChange={(e) => e.target.value && addForDept(e.target.value, "linkedin")}>
              <option value="">+ LinkedIn note for a department…</option>
              {missingLi.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </div>
        )}
      </Card>
      <Card>
        <CardContent className="grid gap-4 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="tn"><Input id="tn" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Used for" htmlFor="td"><Input id="td" value={draft.department ?? "All departments (default)"} disabled /></Field>
          </div>
          {draft.channel === "email" && <Field label="Subject" htmlFor="ts"><Input id="ts" value={draft.subject ?? ""} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>}
          <Field label={draft.channel === "email" ? "Email body" : "LinkedIn note (300 characters max after filling in)"} htmlFor="tb"
            hint={`Placeholders: ${q.data.placeholders.map((p) => `{{${p}}}`).join(" ")}. Claude writes only {{personal_line}}: one sentence about a fact on the candidate's profile.`}>
            <Textarea id="tb" rows={draft.channel === "email" ? 16 : 5} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="font-mono text-[13px]" />
          </Field>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} /> Active</label>
            <Button onClick={save}>Save template</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Suppression() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["suppression"], queryFn: () => api<{ entries: { id: string; email: string | null; linkedinUrl: string | null; reason: string; createdAt: string }[] }>("/suppression") });
  const [email, setEmail] = useState("");
  async function add() {
    try {
      await api("/suppression", { body: { email, reason: "manual" } });
      setEmail("");
      qc.invalidateQueries({ queryKey: ["suppression"] });
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function remove(id: string) {
    await api(`/suppression/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["suppression"] });
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">People on this list are never contacted again. Current York Press employees are always excluded from searches.</p>
      <div className="flex max-w-md gap-2"><Input placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to block" /><Button onClick={add} disabled={!email}>Add</Button></div>
      <Table>
        <thead><tr><Th>Email / LinkedIn</Th><Th>Reason</Th><Th>Added</Th><Th /></tr></thead>
        <tbody>
          {q.data?.entries.map((e) => (
            <tr key={e.id}><Td className="font-mono text-xs">{e.email ?? e.linkedinUrl}</Td><Td>{e.reason.replace("_", " ")}</Td><Td className="num text-xs">{fmtDateTime(e.createdAt)}</Td><Td><Button size="sm" variant="ghost" onClick={() => remove(e.id)}>Remove</Button></Td></tr>
          ))}
          {!q.data?.entries.length && <tr><Td colSpan={4} className="text-center text-muted-foreground">Nobody on the list.</Td></tr>}
        </tbody>
      </Table>
    </div>
  );
}

function Usage() {
  const q = useQuery({ queryKey: ["usage"], queryFn: () => api<{ byProvider: { provider: string; mock: boolean; units: number; inputTokens: number; outputTokens: number; calls: number }[]; runs: { id: string; title: string; kind: string; status: string; pdlRecords: number; signalhireCredits: number; webSearches: number; createdAt: string }[] }>("/usage") });
  if (!q.data) return <Spinner />;
  const label: Record<string, string> = { claude: "Claude", pdl: "People Data Labs", signalhire: "SignalHire", resend: "Resend" };
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {q.data.byProvider.filter((p) => !p.mock).map((p) => (
          <Card key={p.provider} className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label[p.provider] ?? p.provider} · 30 days</div>
            <div className="num mt-1 text-xl font-semibold">{p.provider === "claude" ? `${(p.inputTokens / 1000).toFixed(0)}k / ${(p.outputTokens / 1000).toFixed(0)}k` : p.units}</div>
            <div className="text-xs text-muted-foreground">{p.provider === "claude" ? `tokens in / out · ${p.calls} calls` : p.provider === "pdl" ? "records" : p.provider === "signalhire" ? "searches + credits" : "emails"}</div>
          </Card>
        ))}
        {!q.data.byProvider.some((p) => !p.mock) && <p className="text-sm text-muted-foreground sm:col-span-4">No paid usage yet. Everything so far ran in mock mode.</p>}
      </div>
      <Table>
        <thead><tr><Th>Run</Th><Th>Role</Th><Th>Status</Th><Th>PDL records</Th><Th>SignalHire credits</Th><Th>Web searches</Th></tr></thead>
        <tbody>
          {q.data.runs.map((r) => (
            <tr key={r.id}><Td className="num text-xs">{fmtDateTime(r.createdAt)} · {r.kind}</Td><Td>{r.title}</Td><Td><Badge>{r.status}</Badge></Td><Td className="num">{r.pdlRecords}</Td><Td className="num">{r.signalhireCredits}</Td><Td className="num">{r.webSearches}</Td></tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default function Settings() {
  return (
    <>
      <PageHeader eyebrow="Recruiter" title="Settings" />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Sending & scoring</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="suppression">Do-not-contact</TabsTrigger>
          <TabsTrigger value="usage">Usage & cost</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><General /></TabsContent>
        <TabsContent value="templates"><Templates /></TabsContent>
        <TabsContent value="suppression"><Suppression /></TabsContent>
        <TabsContent value="usage"><Usage /></TabsContent>
      </Tabs>
    </>
  );
}
