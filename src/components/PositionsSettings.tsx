import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import type { Position } from "@/lib/types";
import { PositionForm, type PositionFormValues } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DeptDot, Badge, DataTable, Field, FormError, Select, Spinner, Td, Th, useToast } from "@/components/kit";
import { Combobox } from "@/components/Combobox";
import { DEPARTMENTS, SENIORITIES } from "../../shared/types";

const EMPTY: PositionFormValues = {
  title: "", department: DEPARTMENTS[0], seniority: "Mid", mustHaves: "", niceToHaves: "", languages: "English", minYears: "", idealYears: "", jdText: "", active: true,
};

const toForm = (p: Position): PositionFormValues => ({
  title: p.title, department: p.department, seniority: p.seniority, mustHaves: p.mustHaves.join("\n"), niceToHaves: p.niceToHaves.join("\n"),
  languages: p.languages.join(", "), minYears: p.minYears?.toString() ?? "", idealYears: p.idealYears?.toString() ?? "", jdText: p.jdText, active: p.active,
});

const years = (p: Position) => (p.minYears == null && p.idealYears == null ? "—" : `${p.minYears ?? 0}–${p.idealYears ?? p.minYears}`);

/** Settings tab: the positions managers can pick on the request form, with the details they suggest. */
export function PositionsSettings() {
  const q = useQuery({ queryKey: ["positions"], queryFn: () => call(rpc.positions.$get()) });
  const [editing, setEditing] = useState<Position | "new" | null>(null);
  if (!q.data) return <Spinner />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Managers pick these on the request form, or type a new title. Picking one suggests its department, level, job description,
          must-haves, nice-to-haves, years and languages; the manager can change all of them.
        </p>
        <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add position</Button>
      </div>
      <DataTable>
        <TableHeader><TableRow><Th>Position</Th><Th>Department</Th><Th>Level</Th><Th>Must-haves</Th><Th>Years</Th><Th>Status</Th><Th /></TableRow></TableHeader>
        <TableBody>
          {q.data.positions.map((p) => (
            <TableRow key={p.id}>
              <Td className="font-medium">{p.title}{!p.jdText && <span className="ml-2 text-xs font-normal text-muted-foreground">no JD</span>}</Td>
              <Td><DeptDot name={p.department} /></Td>
              <Td>{p.seniority}</Td>
              <Td className="max-w-xs truncate text-muted-foreground" title={p.mustHaves.join(", ")}>{p.mustHaves.join(", ") || "—"}</Td>
              <Td className="num">{years(p)}</Td>
              <Td><Badge tone={p.active ? "good" : "neutral"} dot>{p.active ? "Shown" : "Hidden"}</Badge></Td>
              <Td><Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button></Td>
            </TableRow>
          ))}
          {!q.data.positions.length && <TableRow><Td colSpan={7} className="text-center text-muted-foreground">No saved positions yet.</Td></TableRow>}
        </TableBody>
      </DataTable>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          {editing && <PositionEditor key={editing === "new" ? "new" : editing.id} position={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PositionEditor({ position, onDone }: { position: Position | null; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(PositionForm), defaultValues: position ? toForm(position) : EMPTY });
  const { errors, isSubmitting } = form.formState;
  const reg = (name: keyof PositionFormValues) => ({ ...form.register(name), "aria-invalid": !!errors[name] });

  const save = form.handleSubmit(async (body) => {
    try {
      if (position) await call(rpc.positions[":id"].$patch({ param: { id: position.id }, json: body }));
      else await call(rpc.positions.$post({ json: body }));
      await qc.invalidateQueries({ queryKey: ["positions"] });
      toast(position ? "Position saved." : "Position added.");
      onDone();
    } catch (e) {
      form.setError("root", { message: (e as Error).message });
    }
  });

  async function remove() {
    if (!position || !window.confirm(`Delete "${position.title}" from the list? Requests that used it keep their details.`)) return;
    try {
      await call(rpc.positions[":id"].$delete({ param: { id: position.id } }));
      await qc.invalidateQueries({ queryKey: ["positions"] });
      toast("Position deleted.");
      onDone();
    } catch (e) {
      form.setError("root", { message: (e as Error).message });
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{position ? "Edit position" : "Add a position"}</DialogTitle>
        <DialogDescription>These details are suggestions on the request form. Managers can change them.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Job title" htmlFor="p-title" className="sm:col-span-3" error={errors.title?.message}><Input id="p-title" {...reg("title")} /></Field>
        <Field label="Department" htmlFor="p-dept" error={errors.department?.message}><Select id="p-dept" {...reg("department")}>{[...new Set([...DEPARTMENTS, form.watch("department")])].filter(Boolean).map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label="Seniority" htmlFor="p-sen" error={errors.seniority?.message}>
          <Controller control={form.control} name="seniority" render={({ field }) => (
            <Combobox id="p-sen" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.seniority}
              listLabel="Levels" options={SENIORITIES.map((s) => ({ id: s, label: s }))} />
          )} />
        </Field>
        <Field label="Languages" hint="Comma-separated." htmlFor="p-lang" error={errors.languages?.message}><Input id="p-lang" {...reg("languages")} /></Field>
        <Field label="Must-haves" hint="One per line." htmlFor="p-must" error={errors.mustHaves?.message}><Textarea id="p-must" rows={4} {...reg("mustHaves")} /></Field>
        <Field label="Nice-to-haves" hint="One per line." htmlFor="p-nice" error={errors.niceToHaves?.message}><Textarea id="p-nice" rows={4} {...reg("niceToHaves")} /></Field>
        <div className="grid content-start gap-4">
          <Field label="Minimum years" htmlFor="p-miny" error={errors.minYears?.message}><Input id="p-miny" inputMode="numeric" {...reg("minYears")} /></Field>
          <Field label="Ideal years" htmlFor="p-idy" error={errors.idealYears?.message}><Input id="p-idy" inputMode="numeric" {...reg("idealYears")} /></Field>
        </div>
        <Field label="Job description" hint="Suggested on the request form. Leave out working hours and location: those come from the location the manager picks."
          htmlFor="p-jd" className="sm:col-span-3" error={errors.jdText?.message}>
          <Textarea id="p-jd" rows={10} className="max-h-[40vh]" {...reg("jdText")} />
        </Field>
      </div>
      <FormError>{errors.root?.message}</FormError>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Controller control={form.control} name="active" render={({ field }) => (
          <label className="flex items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} /> Show on the request form</label>
        )} />
        <div className="flex gap-2">
          {position && <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>Delete</Button>}
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>{position ? "Save" : "Add position"}</Button>
        </div>
      </div>
    </form>
  );
}
