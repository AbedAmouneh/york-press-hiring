import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import type { RequestRow } from "@/lib/types";
import { lines } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CURRENCIES, DEPARTMENTS, SENIORITIES } from "../../shared/types";

type Form = Record<string, string>;
const EMPTY: Form = {
  title: "", department: DEPARTMENTS[0], seniority: "Senior", headcount: "1", startDate: "", kind: "new", jdText: "",
  mustHaves: "", niceToHaves: "", dealBreakers: "", minYears: "", idealYears: "", languages: "English",
  locationPolicy: "Remote, global", searchLocations: "", timeZone: "", salaryMin: "", salaryMax: "", currency: "", salaryPeriod: "year",
  justification: "", targetCompanies: "", avoidCompanies: "", hiringManagerId: "",
};

const toForm = (r: RequestRow): Form => ({
  title: r.title, department: r.department, seniority: r.seniority, headcount: String(r.headcount), startDate: r.startDate ?? "", kind: r.kind,
  jdText: r.jdText, mustHaves: r.mustHaves.join("\n"), niceToHaves: r.niceToHaves.join("\n"), dealBreakers: r.dealBreakers.join("\n"),
  minYears: r.minYears?.toString() ?? "", idealYears: r.idealYears?.toString() ?? "", languages: r.languages.join(", "),
  locationPolicy: r.locationPolicy, searchLocations: r.searchLocations.join(", "), timeZone: r.timeZone ?? "",
  salaryMin: r.salaryMin?.toString() ?? "", salaryMax: r.salaryMax?.toString() ?? "", currency: r.currency ?? "", salaryPeriod: r.salaryPeriod,
  justification: r.justification, targetCompanies: r.targetCompanies.join(", "), avoidCompanies: r.avoidCompanies.join(", "), hiringManagerId: r.hiringManagerId ?? "",
});

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^\d]/g, "")));

export default function RequestForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe().data!.user!;
  const existing = useQuery({ queryKey: ["request", id], queryFn: () => api<{ request: RequestRow }>(`/requests/${id}`), enabled: !!id });
  const people = useQuery({ queryKey: ["hiring-managers"], queryFn: () => api<{ users: { id: string; name: string; department: string | null }[] }>("/people/hiring-managers") });
  const [f, setF] = useState<Form>({ ...EMPTY, hiringManagerId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (existing.data) setF(toForm(existing.data.request)); }, [existing.data]);
  useEffect(() => { if (!id && me.department && (DEPARTMENTS as readonly string[]).includes(me.department)) setF((x) => ({ ...x, department: me.department! })); }, [id, me.department]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(submit: boolean) {
    setBusy(true);
    setError("");
    const body = {
      title: f.title, department: f.department, seniority: f.seniority, headcount: Number(f.headcount) || 1, startDate: f.startDate || null, kind: f.kind,
      jdText: f.jdText, mustHaves: lines(f.mustHaves), niceToHaves: lines(f.niceToHaves), dealBreakers: lines(f.dealBreakers),
      minYears: num(f.minYears), idealYears: num(f.idealYears), languages: csv(f.languages), locationPolicy: f.locationPolicy,
      searchLocations: csv(f.searchLocations), timeZone: f.timeZone || null, salaryMin: num(f.salaryMin), salaryMax: num(f.salaryMax),
      currency: f.currency || null, salaryPeriod: f.salaryPeriod, justification: f.justification,
      targetCompanies: csv(f.targetCompanies), avoidCompanies: csv(f.avoidCompanies), hiringManagerId: f.hiringManagerId || null,
    };
    try {
      let rid = id;
      if (id) {
        await api(`/requests/${id}`, { method: "PATCH", body });
        if (submit) await api(`/requests/${id}/submit`, { method: "POST" });
      } else {
        rid = (await api<{ id: string }>(`/requests${submit ? "?submit=true" : ""}`, { body })).id;
      }
      await qc.invalidateQueries({ queryKey: ["requests"] });
      await qc.invalidateQueries({ queryKey: ["request", rid] });
      toast(submit ? "Submitted. Khalil has been notified." : "Draft saved.");
      nav(`/requests/${rid}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (id && existing.isLoading) return <Spinner />;
  const returned = existing.data?.request.status === "changes_requested" ? existing.data.request.lastEvent : null;

  return (
    <>
      <PageHeader eyebrow={id ? existing.data?.request.code : "New position"} title={id ? "Edit request" : "Request a new position"} />
      {returned?.comment && <p className="mb-4 rounded-r border-l-[3px] border-warning bg-amber-50 px-3 py-2 text-sm"><b>{returned.actorName}:</b> {returned.comment}</p>}
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(true); }}>
        <Card>
          <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Job title" htmlFor="title" className="sm:col-span-2"><Input id="title" value={f.title} onChange={set("title")} required placeholder="e.g. Senior Commissioning Editor" /></Field>
            <Field label="Department" htmlFor="dept"><Select id="dept" value={f.department} onChange={set("department")}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
            <Field label="Seniority" htmlFor="sen"><Select id="sen" value={f.seniority} onChange={set("seniority")}>{SENIORITIES.map((d) => <option key={d}>{d}</option>)}</Select></Field>
            <Field label="Headcount" htmlFor="hc"><Input id="hc" type="number" min={1} value={f.headcount} onChange={set("headcount")} /></Field>
            <Field label="Target start date" htmlFor="sd"><Input id="sd" type="date" value={f.startDate} onChange={set("startDate")} /></Field>
            <Field label="Type" htmlFor="kind"><Select id="kind" value={f.kind} onChange={set("kind")}><option value="new">New role</option><option value="backfill">Backfill</option></Select></Field>
            <Field label="Hiring manager" htmlFor="hm" className="sm:col-span-2">
              <Select id="hm" value={f.hiringManagerId} onChange={set("hiringManagerId")}>
                <option value="">Me</option>
                {people.data?.users.filter((u) => u.id !== me.id).map((u) => <option key={u.id} value={u.id}>{u.name}{u.department ? ` · ${u.department}` : ""}</option>)}
              </Select>
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Job description</CardTitle></CardHeader>
          <CardContent><Textarea rows={7} value={f.jdText} onChange={set("jdText")} placeholder="Paste the job description" aria-label="Job description" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Requirements</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Must-haves" hint="One per line. These carry 35% of the score." htmlFor="must"><Textarea id="must" rows={5} value={f.mustHaves} onChange={set("mustHaves")} /></Field>
            <Field label="Nice-to-haves" hint="One per line." htmlFor="nice"><Textarea id="nice" rows={5} value={f.niceToHaves} onChange={set("niceToHaves")} /></Field>
            <Field label="Deal-breakers" hint="Missing one caps the score at 40." htmlFor="deal"><Textarea id="deal" rows={5} value={f.dealBreakers} onChange={set("dealBreakers")} /></Field>
            <Field label="Minimum years" htmlFor="miny"><Input id="miny" inputMode="numeric" value={f.minYears} onChange={set("minYears")} /></Field>
            <Field label="Ideal years" htmlFor="idy"><Input id="idy" inputMode="numeric" value={f.idealYears} onChange={set("idealYears")} /></Field>
            <Field label="Languages" hint="Comma-separated." htmlFor="lang"><Input id="lang" value={f.languages} onChange={set("languages")} /></Field>
            <Field label="Location policy" htmlFor="loc"><Input id="loc" value={f.locationPolicy} onChange={set("locationPolicy")} placeholder="Remote, global" /></Field>
            <Field label="Search in countries" hint="Comma-separated, e.g. Lebanon, Jordan. Empty = global." htmlFor="sl"><Input id="sl" value={f.searchLocations} onChange={set("searchLocations")} /></Field>
            <Field label="Time-zone overlap" htmlFor="tz"><Input id="tz" value={f.timeZone} onChange={set("timeZone")} placeholder="At least 4 hours with GMT+2" /></Field>
            <Field label="Target companies" hint="Comma-separated." htmlFor="tc"><Input id="tc" value={f.targetCompanies} onChange={set("targetCompanies")} /></Field>
            <Field label="Companies to avoid" hint="York Press is always excluded." htmlFor="ac" className="sm:col-span-2"><Input id="ac" value={f.avoidCompanies} onChange={set("avoidCompanies")} /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Budget</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <Field label="Currency" htmlFor="cur"><Select id="cur" value={f.currency} onChange={set("currency")} required><option value="">Choose…</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Salary from" htmlFor="smin"><Input id="smin" inputMode="numeric" value={f.salaryMin} onChange={set("salaryMin")} /></Field>
            <Field label="Salary to" htmlFor="smax"><Input id="smax" inputMode="numeric" value={f.salaryMax} onChange={set("salaryMax")} /></Field>
            <Field label="Per" htmlFor="per"><Select id="per" value={f.salaryPeriod} onChange={set("salaryPeriod")}><option value="year">Year</option><option value="month">Month</option></Select></Field>
            <Field label="Business justification for Khalil" htmlFor="just" className="sm:col-span-4"><Textarea id="just" value={f.justification} onChange={set("justification")} required /></Field>
          </CardContent>
        </Card>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>Submit to Khalil</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => save(false)}>Save draft</Button>
          <Button type="button" variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
        </div>
      </form>
    </>
  );
}
