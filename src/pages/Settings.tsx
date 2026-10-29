import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { useSearchParams } from "react-router-dom";
import { Ban, Briefcase, FileText, MapPin, SlidersHorizontal, Wallet } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import type { Template } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { PositionsSettings } from "@/components/PositionsSettings";
import { LocationsSettings } from "@/components/LocationsSettings";
import { Button } from "@/components/ui/button";
import { CRITERIA, DEFAULT_WEIGHTS, DEPARTMENTS, type Weights } from "../../shared/types";
import { LINKEDIN_NOTE_MAX, TemplateInput } from "../../shared/schemas";
import { Badge, DataTable, Field, FormError, Select, Spinner, Td, Th, useToast } from "@/components/kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type SettingsPatch = InferRequestType<typeof rpc.settings.$patch>["json"];

function Live({ live, inUse = true }: { live: boolean; inUse?: boolean }) {
  if (!inUse) return <Badge tone="neutral" dot>Not used</Badge>;
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

function Retention() {
  const q = useQuery({ queryKey: ["retention"], queryFn: () => call(rpc.retention.$get()) });
  const n = q.data?.nextRun;
  return (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle>Automatic data deletion</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <p>
          Every day, personal data that nobody has touched for {q.data?.months ?? 24} months is deleted: candidates who aren't in an open role,
          CVs for roles that are no longer open, copies of sent emails and old notifications. The do-not-contact list is kept so people who
          opted out are never contacted again.
        </p>
        {n ? (
          <p className="text-muted-foreground">
            Next run (anything older than {fmtDateTime(n.cutoff)}): {n.candidates} candidates, {n.applications} CVs, {n.emailLog} emails, {n.notifications} notifications, {n.messages} discussion messages.
          </p>
        ) : <Spinner />}
      </CardContent>
    </Card>
  );
}

function General() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => call(rpc.settings.$get()) });
  const [cap, setCap] = useState("");
  const [w, setW] = useState<Weights>(DEFAULT_WEIGHTS);
  const [limit, setLimit] = useState("");
  useEffect(() => { if (q.data) { setCap(String(q.data.settings.dailySendCap)); setLimit(q.data.settings.signalhireMonthlyLimit == null ? "" : String(q.data.settings.signalhireMonthlyLimit)); setW(q.data.settings.defaultWeights ?? DEFAULT_WEIGHTS); } }, [q.data]);
  if (!q.data) return <Spinner />;
  const s = q.data.settings;
  const i = q.data.integrations;
  async function patch(body: SettingsPatch, msg: string) {
    try {
      await call(rpc.settings.$patch({ json: body }));
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
          <Field label="SignalHire monthly credit limit" hint={`Used this month: ${i.signalhire.spentThisMonth}. Leave empty for no limit.`} htmlFor="shl">
            <div className="flex gap-2">
              <Input id="shl" type="number" min={0} placeholder="No limit" value={limit} onChange={(e) => setLimit(e.target.value)} />
              <Button variant="outline" onClick={() => patch({ signalhireMonthlyLimit: limit.trim() === "" ? null : Number(limit) }, "Credit limit saved.")}>Save</Button>
            </div>
          </Field>
          <SwitchRow id="ws" label="Claude web search on the top 20" hint={q.data.integrations.claude.via === "OpenCode" || q.data.integrations.claude.via === "Gemini" ? `Not available through ${q.data.integrations.claude.via}, so this step is skipped.` :"Looks for portfolios, GitHub and publications ($10 per 1,000 searches)."} checked={s.webSearchEnabled} onChange={(v) => patch({ webSearchEnabled: v }, "Saved.")} />
          <SwitchRow id="sum" label="Weekly summary for Khalil" hint="Monday 09:00 Beirut: open roles, pipeline and spend." checked={s.weeklySummaryEnabled} onChange={(v) => patch({ weeklySummaryEnabled: v }, "Saved.")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Connections</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex justify-between gap-2"><span>{i.claude.via === "Gemini" ? "AI: Gemini" : `Claude${i.claude.via ? ` via ${i.claude.via}` : " API"}`} <span className="text-muted-foreground">· {i.claude.model}</span></span><Live live={i.claude.live} /></div>
          <div className="flex justify-between gap-2"><span>People Data Labs <span className="text-muted-foreground">· search</span></span><Live live={i.pdl.live} inUse={i.pdl.inUse} /></div>
          <div className="flex justify-between gap-2"><span>SignalHire <span className="text-muted-foreground">· search + contacts{i.signalhire.creditsLeft != null ? ` · ${i.signalhire.creditsLeft} credits left` : ""}</span></span><Live live={i.signalhire.live} inUse={i.signalhire.inUse} /></div>
          <div className="flex justify-between gap-2"><span>Email (Resend) <span className="text-muted-foreground">· {i.email.from}</span></span><Live live={i.email.live} /></div>
          <div className="flex justify-between gap-2"><span>Database</span><Badge tone={i.database.live ? "good" : "warn"} dot>{i.database.live ? "Postgres" : "Local file"}</Badge></div>
          <div className="flex justify-between gap-2"><span>LinkedIn messaging</span><Badge tone="info">Claude in Chrome · approval required</Badge></div>
          <p className="text-xs text-muted-foreground">Add API keys in Vercel → Project → Settings → Environment Variables, then redeploy. See SETUP_GUIDE.md.</p>
        </CardContent>
      </Card>
      <Retention />
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Default scorecard weights</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {CRITERIA.map((c) => (
            <div key={c.key} className="grid grid-cols-[1fr_180px_40px] items-center gap-3 text-sm">
              <label htmlFor={`dw-${c.key}`}>{c.label}</label>
              <input id={`dw-${c.key}`} type="range" min={0} max={50} value={w[c.key]} onChange={(e) => setW({ ...w, [c.key]: Number(e.target.value) })} className="accent-primary" />
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
  const q = useQuery({ queryKey: ["templates"], queryFn: () => call(rpc.templates.$get()) });
  const [sel, setSel] = useState<string>("");
  if (!q.data) return <Spinner />;
  const current = q.data.templates.find((x) => x.id === sel) ?? q.data.templates[0];
  if (!current) return <Spinner />;
  async function addForDept(dept: string, channel: "email" | "linkedin") {
    const base = q.data!.templates.find((t) => t.channel === channel && !t.department)!;
    const res = await call(rpc.templates.$post({ json: { name: `${dept} ${channel === "email" ? "email" : "LinkedIn note"}`, department: dept, channel, subject: base.subject, body: base.body } }));
    await qc.invalidateQueries({ queryKey: ["templates"] });
    setSel(res.template.id);
  }
  const missingLi = DEPARTMENTS.filter((d) => !q.data!.templates.some((t) => t.channel === "linkedin" && t.department === d));
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit p-2">
        {q.data.templates.map((t) => (
          <button key={t.id} onClick={() => setSel(t.id)} className={cn("flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-secondary", t.id === current.id && "bg-secondary font-semibold")}>
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
      <TemplateEditor key={current.id} template={current} placeholders={q.data.placeholders} onSaved={() => { toast("Template saved."); qc.invalidateQueries({ queryKey: ["templates"] }); }} />
    </div>
  );
}

function TemplateEditor({ template, placeholders, onSaved }: { template: Template; placeholders: readonly string[]; onSaved: () => void }) {
  const form = useForm({
    resolver: zodResolver(TemplateInput),
    defaultValues: { name: template.name, department: template.department, channel: template.channel, subject: template.subject, body: template.body, active: template.active },
  });
  const { errors, isSubmitting } = form.formState;
  const isEmail = template.channel === "email";
  const save = form.handleSubmit(async (values) => {
    try {
      await call(rpc.templates[":id"].$patch({ param: { id: template.id }, json: values }));
      onSaved();
    } catch (e) {
      form.setError("root", { message: (e as Error).message });
    }
  });
  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={save} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field required label="Name" htmlFor="tn" error={errors.name?.message}><Input id="tn" aria-invalid={!!errors.name} {...form.register("name")} /></Field>
            <Field label="Used for" htmlFor="td"><Input id="td" value={template.department ?? "All departments (default)"} disabled readOnly /></Field>
          </div>
          {isEmail && <Field label="Subject" htmlFor="ts" error={errors.subject?.message}><Input id="ts" {...form.register("subject")} /></Field>}
          <Field required label={isEmail ? "Email body" : `LinkedIn note (${LINKEDIN_NOTE_MAX} characters max after filling in)`} htmlFor="tb" error={errors.body?.message}
            hint={`Placeholders: ${placeholders.map((p) => `{{${p}}}`).join(" ")}. Claude writes only {{personal_line}}: one sentence about a fact on the candidate's profile.`}>
            <Textarea id="tb" rows={isEmail ? 16 : 5} className="font-mono text-[13px]" aria-invalid={!!errors.body} {...form.register("body")} />
          </Field>
          <FormError>{errors.root?.message}</FormError>
          <div className="flex items-center justify-between">
            <Controller control={form.control} name="active" render={({ field }) => (
              <label className="flex items-center gap-2 text-sm"><Switch checked={!!field.value} onCheckedChange={field.onChange} /> Active</label>
            )} />
            <Button type="submit" disabled={isSubmitting}>Save template</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Suppression() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["suppression"], queryFn: () => call(rpc.suppression.$get()) });
  const [email, setEmail] = useState("");
  async function add() {
    try {
      await call(rpc.suppression.$post({ json: { email, reason: "manual" } }));
      setEmail("");
      qc.invalidateQueries({ queryKey: ["suppression"] });
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function remove(id: string) {
    await call(rpc.suppression[":id"].$delete({ param: { id } }));
    qc.invalidateQueries({ queryKey: ["suppression"] });
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">People on this list are never contacted again. Current York Press employees are always excluded from searches.</p>
      <div className="flex max-w-md gap-2"><Input placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to block" /><Button onClick={add} disabled={!email}>Add</Button></div>
      <DataTable>
        <TableHeader><TableRow><Th>Email / LinkedIn</Th><Th>Reason</Th><Th>Added</Th><Th /></TableRow></TableHeader>
        <TableBody>
          {q.data?.entries.map((e) => (
            <TableRow key={e.id}><Td className="font-mono text-xs">{e.email ?? e.linkedinUrl}</Td><Td>{e.reason.replace("_", " ")}</Td><Td className="num text-xs">{fmtDateTime(e.createdAt)}</Td><Td><Button size="sm" variant="ghost" onClick={() => remove(e.id)}>Remove</Button></Td></TableRow>
          ))}
          {!q.data?.entries.length && <TableRow><Td colSpan={4} className="text-center text-muted-foreground">Nobody on the list.</Td></TableRow>}
        </TableBody>
      </DataTable>
    </div>
  );
}

/** Share of input tokens served from the prompt cache (billed at about a tenth of the normal price). */
const cacheShare = (p: { inputTokens: number; cacheReadTokens: number }) =>
  Math.round((100 * p.cacheReadTokens) / Math.max(1, p.inputTokens + p.cacheReadTokens));

function Usage() {
  const q = useQuery({ queryKey: ["usage"], queryFn: () => call(rpc.usage.$get()) });
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
            {p.provider === "claude" && (p.cacheReadTokens > 0 || p.batchCalls > 0) && (
              <div className="mt-1 text-xs text-success">
                {cacheShare(p)}% of input read from cache{p.batchCalls ? ` · ${p.batchCalls} half-price batch calls` : ""}
              </div>
            )}
          </Card>
        ))}
        {!q.data.byProvider.some((p) => !p.mock) && <p className="text-sm text-muted-foreground sm:col-span-4">No paid usage yet. Everything so far ran in mock mode.</p>}
      </div>
      <DataTable>
        <TableHeader><TableRow><Th>Run</Th><Th>Role</Th><Th>Status</Th><Th>PDL records</Th><Th>SignalHire credits</Th><Th>Web searches</Th></TableRow></TableHeader>
        <TableBody>
          {q.data.runs.map((r) => (
            <TableRow key={r.id}><Td className="num text-xs">{fmtDateTime(r.createdAt)} · {r.kind}</Td><Td>{r.title}</Td><Td><Badge>{r.status}</Badge></Td><Td className="num">{r.pdlRecords}</Td><Td className="num">{r.signalhireCredits}</Td><Td className="num">{r.webSearches}</Td></TableRow>
          ))}
        </TableBody>
      </DataTable>
    </div>
  );
}

const SECTIONS = [
  ["general", "Sending & scoring", SlidersHorizontal],
  ["positions", "Positions", Briefcase],
  ["locations", "Locations", MapPin],
  ["templates", "Templates", FileText],
  ["suppression", "Do-not-contact", Ban],
  ["usage", "Usage & cost", Wallet],
] as const;

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "general";
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} orientation="vertical" className="flex-col gap-6 md:flex-row md:items-start">
        <TabsList
          variant="line"
          className="h-auto w-full shrink-0 flex-row items-stretch overflow-x-auto md:sticky md:top-20 md:w-52 md:flex-col [&>button]:h-auto [&>button]:flex-none [&>button]:justify-start [&>button]:gap-2.5 [&>button]:rounded-md [&>button]:px-3 [&>button]:py-2 [&>button]:after:hidden [&>button[data-state=active]]:bg-card [&>button[data-state=active]]:shadow-sm"
        >
          {SECTIONS.map(([value, label, Icon]) => (
            <TabsTrigger key={value} value={value}><Icon className="size-4" /> {label}</TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0 flex-1">
          <TabsContent value="general"><General /></TabsContent>
          <TabsContent value="positions"><PositionsSettings /></TabsContent>
          <TabsContent value="locations"><LocationsSettings /></TabsContent>
          <TabsContent value="templates"><Templates /></TabsContent>
          <TabsContent value="suppression"><Suppression /></TabsContent>
          <TabsContent value="usage"><Usage /></TabsContent>
        </div>
      </Tabs>
    </>
  );
}
