import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { useMe } from "@/lib/auth";
import type { RequestRow } from "@/lib/types";
import { RequestForm as RequestFormSchema, type RequestFormValues } from "@/lib/forms";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CURRENCIES, DEPARTMENTS, SENIORITIES } from "../../shared/types";
import type { RequestInputT } from "../../shared/schemas";
import { Field, FormError, Select, Spinner, useToast } from "@/components/kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMPTY: RequestFormValues = {
  title: "", department: DEPARTMENTS[0], seniority: "Senior", headcount: "1", startDate: "", kind: "new", jdText: "",
  mustHaves: "", niceToHaves: "", dealBreakers: "", minYears: "", idealYears: "", languages: "English",
  locationPolicy: "Remote, global", searchLocations: "", timeZone: "", salaryMin: "", salaryMax: "", currency: "", salaryPeriod: "year",
  justification: "", targetCompanies: "", avoidCompanies: "", hiringManagerId: "",
};

const toForm = (r: RequestRow): RequestFormValues => ({
  title: r.title, department: r.department, seniority: r.seniority, headcount: String(r.headcount), startDate: r.startDate ?? "", kind: r.kind,
  jdText: r.jdText, mustHaves: r.mustHaves.join("\n"), niceToHaves: r.niceToHaves.join("\n"), dealBreakers: r.dealBreakers.join("\n"),
  minYears: r.minYears?.toString() ?? "", idealYears: r.idealYears?.toString() ?? "", languages: r.languages.join(", "),
  locationPolicy: r.locationPolicy, searchLocations: r.searchLocations.join(", "), timeZone: r.timeZone ?? "",
  salaryMin: r.salaryMin?.toString() ?? "", salaryMax: r.salaryMax?.toString() ?? "", currency: r.currency ?? "", salaryPeriod: r.salaryPeriod,
  justification: r.justification, targetCompanies: r.targetCompanies.join(", "), avoidCompanies: r.avoidCompanies.join(", "), hiringManagerId: r.hiringManagerId ?? "",
});

export default function RequestForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe().data!.user!;
  const existing = useQuery({ queryKey: ["request", id], queryFn: () => call(rpc.requests[":id"].$get({ param: { id: id! } })), enabled: !!id });
  const people = useQuery({ queryKey: ["hiring-managers"], queryFn: () => call(rpc.people["hiring-managers"].$get()) });
  const form = useForm({ resolver: zodResolver(RequestFormSchema), defaultValues: EMPTY });
  const { errors, isSubmitting } = form.formState;
  const reg = (name: keyof RequestFormValues) => ({ ...form.register(name), "aria-invalid": !!errors[name] });

  useEffect(() => { if (existing.data) form.reset(toForm(existing.data.request)); }, [existing.data, form]);
  useEffect(() => {
    if (!id && me.department && (DEPARTMENTS as readonly string[]).includes(me.department)) form.setValue("department", me.department);
  }, [id, me.department, form]);

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
        <Card>
          <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Job title" htmlFor="title" className="sm:col-span-2" error={errors.title?.message}><Input id="title" placeholder="e.g. Senior Commissioning Editor" {...reg("title")} /></Field>
            <Field label="Department" htmlFor="dept" error={errors.department?.message}><Select id="dept" {...reg("department")}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
            <Field label="Seniority" htmlFor="sen" error={errors.seniority?.message}><Select id="sen" {...reg("seniority")}>{SENIORITIES.map((d) => <option key={d}>{d}</option>)}</Select></Field>
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
            <Field label="Location policy" htmlFor="loc" error={errors.locationPolicy?.message}><Input id="loc" placeholder="Remote, global" {...reg("locationPolicy")} /></Field>
            <Field label="Search in countries" hint="Comma-separated, e.g. Lebanon, Jordan. Empty = global." htmlFor="sl" error={errors.searchLocations?.message}><Input id="sl" {...reg("searchLocations")} /></Field>
            <Field label="Time-zone overlap" htmlFor="tz" error={errors.timeZone?.message}><Input id="tz" placeholder="At least 4 hours with GMT+2" {...reg("timeZone")} /></Field>
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
