import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { useMe } from "@/lib/auth";
import type { HiringLocation, Position, RequestRow } from "@/lib/types";
import { RequestForm as RequestFormSchema, type RequestFormValues } from "@/lib/forms";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CURRENCIES, DEPARTMENTS, SENIORITIES } from "../../shared/types";
import type { RequestInputT } from "../../shared/schemas";
import { Field, FormError, Select, Spinner, useToast } from "@/components/kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/Combobox";
import { PositionPicker } from "@/components/PositionPicker";
import { yearsLabel } from "@/lib/positions";
import { Check, Undo2 } from "lucide-react";

const EMPTY: RequestFormValues = {
  title: "", department: DEPARTMENTS[0], seniority: "Mid", headcount: "1", startDate: "", kind: "new", jdText: "",
  mustHaves: "", niceToHaves: "", dealBreakers: "", minYears: "", idealYears: "", languages: "English",
  locationPolicy: "", searchLocations: "", timeZone: "", locationId: "", workingHours: "", salaryMin: "", salaryMax: "", currency: "", salaryPeriod: "year",
  justification: "", targetCompanies: "", avoidCompanies: "", hiringManagerId: "",
};

const toForm = (r: RequestRow): RequestFormValues => ({
  title: r.title, department: r.department, seniority: r.seniority, headcount: String(r.headcount), startDate: r.startDate ?? "", kind: r.kind,
  jdText: r.jdText, mustHaves: r.mustHaves.join("\n"), niceToHaves: r.niceToHaves.join("\n"), dealBreakers: r.dealBreakers.join("\n"),
  minYears: r.minYears?.toString() ?? "", idealYears: r.idealYears?.toString() ?? "", languages: r.languages.join(", "),
  locationPolicy: r.locationPolicy, searchLocations: r.searchLocations.join(", "), timeZone: r.timeZone ?? "",
  salaryMin: r.salaryMin?.toString() ?? "", salaryMax: r.salaryMax?.toString() ?? "", currency: r.currency ?? "", salaryPeriod: r.salaryPeriod,
  justification: r.justification, targetCompanies: r.targetCompanies.join(", "), avoidCompanies: r.avoidCompanies.join(", "), hiringManagerId: r.hiringManagerId ?? "",
  locationId: r.locationId ?? "", workingHours: r.workingHours ?? "",
});

type Suggestable = "department" | "seniority" | "jdText" | "mustHaves" | "niceToHaves" | "minYears" | "idealYears" | "languages";
const SUGGESTION_LABELS: Record<Suggestable, string> = {
  department: "department", seniority: "level", jdText: "job description", mustHaves: "must-haves", niceToHaves: "nice-to-haves",
  minYears: "minimum years", idealYears: "ideal years", languages: "languages",
};
type LocationField = "locationPolicy" | "searchLocations" | "workingHours";
type AutoField = Suggestable | LocationField;

/** What picking a location fills in: arrangement and place, the country to search, and the hours. */
const fromLocation = (l: HiringLocation): Record<LocationField, string> => ({
  locationPolicy: `${l.workArrangement}, ${l.name}`, searchLocations: l.country, workingHours: l.workingHours,
});

/** A saved position's details in the form's text shape. Empty values are left out so they never clear a field. */
function suggestionsFrom(p: Position): Partial<Record<Suggestable, string>> {
  const out: Partial<Record<Suggestable, string>> = {
    department: p.department, seniority: p.seniority, jdText: p.jdText, mustHaves: p.mustHaves.join("\n"), niceToHaves: p.niceToHaves.join("\n"),
    minYears: p.minYears?.toString() ?? "", idealYears: p.idealYears?.toString() ?? "", languages: p.languages.join(", "),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Partial<Record<Suggestable, string>>;
}

/** The fixed list plus a value saved earlier that is no longer in it, so editing an old request doesn't change it. */
const withCurrent = (list: readonly string[], current: string) => (current && !list.includes(current) ? [...list, current] : [...list]);

export default function RequestForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe().data!.user!;
  const existing = useQuery({ queryKey: ["request", id], queryFn: () => call(rpc.requests[":id"].$get({ param: { id: id! } })), enabled: !!id });
  const people = useQuery({ queryKey: ["hiring-managers"], queryFn: () => call(rpc.people["hiring-managers"].$get()) });
  const positions = useQuery({ queryKey: ["positions"], queryFn: () => call(rpc.positions.$get()) });
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => call(rpc.locations.$get()) });
  /** The last position picked: what it filled, and the values those fields had before, for Undo. */
  const [suggested, setSuggested] = useState<{ position: Position; fields: string[]; before: Partial<Record<Suggestable, string>> } | null>(null);
  const autoFilled = useRef<Partial<Record<AutoField, string>>>({});
  const myDepartment = me.department && (DEPARTMENTS as readonly string[]).includes(me.department) ? me.department : EMPTY.department;
  const form = useForm({ resolver: zodResolver(RequestFormSchema), defaultValues: EMPTY });
  const { errors, isSubmitting } = form.formState;
  const reg = (name: keyof RequestFormValues) => ({ ...form.register(name), "aria-invalid": !!errors[name] });

  useEffect(() => { if (existing.data) form.reset(toForm(existing.data.request)); }, [existing.data, form]);
  useEffect(() => {
    if (!id && me.department && (DEPARTMENTS as readonly string[]).includes(me.department)) form.setValue("department", me.department);
  }, [id, me.department, form]);

  /**
   * Fill in a saved position's details as suggestions. A field is only replaced while it is empty, still holds
   * its starting value (new requests only) or still holds the previous suggestion, so nothing the manager
   * typed is ever overwritten.
   */
  /** Set a field unless the manager has typed in it. Returns whether it was set. */
  function fillIfUntouched(name: AutoField, value: string) {
    const current = form.getValues(name);
    const start = name === "department" ? myDepartment : EMPTY[name];
    const untouched = current.trim() === "" || current === autoFilled.current[name] || (!id && current === start);
    if (!untouched || current === value) return false;
    form.setValue(name, value, { shouldValidate: form.formState.isSubmitted });
    autoFilled.current[name] = value;
    return true;
  }

  function suggest(p: Position) {
    const filled: string[] = [];
    const before: Partial<Record<Suggestable, string>> = {};
    for (const [name, value] of Object.entries(suggestionsFrom(p)) as [Suggestable, string][]) {
      const previous = form.getValues(name);
      if (fillIfUntouched(name, value)) { filled.push(SUGGESTION_LABELS[name]); before[name] = previous; }
    }
    setSuggested({ position: p, fields: filled, before });
  }

  /** Put back what the fields held before the last pick; the title stays. */
  function undoSuggestions() {
    if (!suggested) return;
    for (const [name, value] of Object.entries(suggested.before) as [Suggestable, string][]) {
      form.setValue(name, value);
      delete autoFilled.current[name];
    }
    setSuggested(null);
  }

  function pickLocation(locationId: string) {
    const l = locations.data?.locations.find((x) => x.id === locationId);
    if (!l) return;
    for (const [name, value] of Object.entries(fromLocation(l)) as [LocationField, string][]) fillIfUntouched(name, value);
  }

  async function save(body: RequestInputT, submit: boolean) {
    try {
      let rid = id;
      if (id) {
        await call(rpc.requests[":id"].$patch({ param: { id }, json: body }));
        if (submit) await call(rpc.requests[":id"].submit.$post({ param: { id } }));
      } else {
        rid = (await call(rpc.requests.$post({ query: submit ? { submit: "true" } : {}, json: body }))).id;
      }
      await qc.invalidateQueries({ queryKey: ["requests"] });
      await qc.invalidateQueries({ queryKey: ["request", rid] });
      toast(submit ? "Submitted. Khalil has been notified." : "Draft saved.");
      nav(`/requests/${rid}`);
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  }

  if (id && existing.isLoading) return <Spinner />;
  const returned = existing.data?.request.status === "changes_requested" ? existing.data.request.lastEvent : null;

  return (
    <>
      <PageHeader eyebrow={id ? existing.data?.request.code : "New position"} title={id ? "Edit request" : "Request a new position"} />
      {returned?.comment && <p className="mb-4 rounded-r border-l-[3px] border-warning bg-amber-50 px-3 py-2 text-sm"><b>{returned.actorName}:</b> {returned.comment}</p>}
      <form className="grid gap-5" onSubmit={form.handleSubmit((v) => save(v, true))} noValidate>
        {/* overflow-visible so the job title list can open past the card's edge */}
        <Card className="overflow-visible">
          <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Job title" htmlFor="title" className="sm:col-span-2" error={errors.title?.message}
              hint={suggested ? undefined : "Pick a position York Press hires for often, or type a new title."}>
              <Controller control={form.control} name="title" render={({ field }) => (
                <PositionPicker id="title" value={field.value} onBlur={field.onBlur} invalid={!!errors.title}
                  positions={positions.data?.positions ?? []}
                  onChange={(v) => { field.onChange(v); if (suggested && v !== suggested.position.title) setSuggested(null); }}
                  onPick={suggest} />
              )} />
              {suggested && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs" role="status">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-foreground/80">
                    {[suggested.position.department, suggested.position.seniority, yearsLabel(suggested.position)].filter(Boolean).join(" · ")}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground" title={suggested.fields.length ? `Suggested: ${suggested.fields.join(", ")}` : undefined}>
                    {suggested.fields.length
                      ? <><Check className="h-3.5 w-3.5 text-success" /> {suggested.fields.length} {suggested.fields.length === 1 ? "detail" : "details"} suggested below. Change anything you like.</>
                      : <>Saved position. Your own details were kept.</>}
                  </span>
                  {suggested.fields.length > 0 && (
                    <button type="button" onClick={undoSuggestions} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
                      <Undo2 className="h-3.5 w-3.5" /> Undo suggestions
                    </button>
                  )}
                </div>
              )}
            </Field>
            <Field label="Department" htmlFor="dept" error={errors.department?.message}><Select id="dept" {...reg("department")}>{withCurrent(DEPARTMENTS, form.watch("department")).map((d) => <option key={d}>{d}</option>)}</Select></Field>
            <Field label="Location" htmlFor="loc-id" error={errors.locationId?.message} hint="Where this person will work. Ask a recruiter to add a missing one.">
              <Select id="loc-id" aria-invalid={!!errors.locationId} {...form.register("locationId", { onChange: (e) => pickLocation(e.target.value) })}>
                <option value="">Choose…</option>
                {locations.data?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Seniority" htmlFor="sen" error={errors.seniority?.message}>
              <Controller control={form.control} name="seniority" render={({ field }) => (
                <Combobox id="sen" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.seniority}
                  listLabel="Levels" options={SENIORITIES.map((s) => ({ id: s, label: s }))} />
              )} />
            </Field>
            <Field label="Headcount" htmlFor="hc" error={errors.headcount?.message}><Input id="hc" type="number" min={1} {...reg("headcount")} /></Field>
            <Field label="Target start date" htmlFor="sd" error={errors.startDate?.message}><Input id="sd" type="date" {...reg("startDate")} /></Field>
            <Field label="Type" htmlFor="kind"><Select id="kind" {...reg("kind")}><option value="new">New role</option><option value="backfill">Backfill</option></Select></Field>
            <Field label="Hiring manager" htmlFor="hm" className="sm:col-span-2" error={errors.hiringManagerId?.message}>
              <Select id="hm" {...reg("hiringManagerId")}>
                <option value="">Me</option>
                {people.data?.users.filter((u) => u.id !== me.id).map((u) => <option key={u.id} value={u.id}>{u.name}{u.department ? ` · ${u.department}` : ""}</option>)}
              </Select>
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Job description</CardTitle></CardHeader>
          <CardContent><Textarea rows={7} placeholder="Paste the job description" aria-label="Job description" {...reg("jdText")} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Requirements</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Must-haves" hint="One per line. These carry 35% of the score." htmlFor="must" error={errors.mustHaves?.message}><Textarea id="must" rows={5} {...reg("mustHaves")} /></Field>
            <Field label="Nice-to-haves" hint="One per line." htmlFor="nice" error={errors.niceToHaves?.message}><Textarea id="nice" rows={5} {...reg("niceToHaves")} /></Field>
            <Field label="Deal-breakers" hint="Missing one caps the score at 40." htmlFor="deal" error={errors.dealBreakers?.message}><Textarea id="deal" rows={5} {...reg("dealBreakers")} /></Field>
            <Field label="Minimum years" htmlFor="miny" error={errors.minYears?.message}><Input id="miny" inputMode="numeric" {...reg("minYears")} /></Field>
            <Field label="Ideal years" htmlFor="idy" error={errors.idealYears?.message}><Input id="idy" inputMode="numeric" {...reg("idealYears")} /></Field>
            <Field label="Languages" hint="Comma-separated." htmlFor="lang" error={errors.languages?.message}><Input id="lang" {...reg("languages")} /></Field>
            <Field label="Location policy" htmlFor="loc" error={errors.locationPolicy?.message}><Input id="loc" placeholder="On-site, Zouk Mosbeh, Lebanon" {...reg("locationPolicy")} /></Field>
            <Field label="Search in countries" hint="Comma-separated, e.g. Lebanon, Jordan. Empty = global." htmlFor="sl" error={errors.searchLocations?.message}><Input id="sl" {...reg("searchLocations")} /></Field>
            <Field label="Time-zone overlap" htmlFor="tz" error={errors.timeZone?.message}><Input id="tz" placeholder="At least 4 hours with GMT+2" {...reg("timeZone")} /></Field>
            <Field label="Working hours" htmlFor="wh" error={errors.workingHours?.message}><Input id="wh" placeholder="Mon–Fri 8:00–17:00" {...reg("workingHours")} /></Field>
            <Field label="Target companies" hint="Comma-separated." htmlFor="tc" error={errors.targetCompanies?.message}><Input id="tc" {...reg("targetCompanies")} /></Field>
            <Field label="Companies to avoid" hint="York Press is always excluded." htmlFor="ac" className="sm:col-span-2" error={errors.avoidCompanies?.message}><Input id="ac" {...reg("avoidCompanies")} /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Budget</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <Field label="Currency" htmlFor="cur" error={errors.currency?.message}><Select id="cur" {...reg("currency")}><option value="">Choose…</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Salary from" htmlFor="smin" error={errors.salaryMin?.message}><Input id="smin" inputMode="numeric" {...reg("salaryMin")} /></Field>
            <Field label="Salary to" htmlFor="smax" error={errors.salaryMax?.message}><Input id="smax" inputMode="numeric" {...reg("salaryMax")} /></Field>
            <Field label="Per" htmlFor="per"><Select id="per" {...reg("salaryPeriod")}><option value="year">Year</option><option value="month">Month</option></Select></Field>
            <Field label="Business justification for Khalil" htmlFor="just" className="sm:col-span-4" error={errors.justification?.message}><Textarea id="just" {...reg("justification")} /></Field>
          </CardContent>
        </Card>
        <FormError>{errors.root?.message}</FormError>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}>Submit to Khalil</Button>
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={form.handleSubmit((v) => save(v, false))}>Save draft</Button>
          <Button type="button" variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
        </div>
      </form>
    </>
  );
}
