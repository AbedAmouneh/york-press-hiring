import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import type { HiringLocation } from "@/lib/types";
import { LocationForm, type LocationFormValues } from "@/lib/forms";
import { WORK_ARRANGEMENTS } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Badge, DataTable, Field, FormError, Select, Spinner, Td, Th, useToast } from "@/components/kit";

type Values = LocationFormValues;
const EMPTY: Values = { name: "", country: "", city: "", workArrangement: "On-site", workingHours: "", active: true };
const toForm = (l: HiringLocation): Values => ({
  name: l.name, country: l.country, city: l.city ?? "", workArrangement: l.workArrangement, workingHours: l.workingHours, active: l.active,
});

/** Settings tab: the places managers choose on a request; each fills arrangement, hours and the country to search. */
export function LocationsSettings() {
  const q = useQuery({ queryKey: ["locations"], queryFn: () => call(rpc.locations.$get()) });
  const [editing, setEditing] = useState<HiringLocation | "new" | null>(null);
  if (!q.data) return <Spinner />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Managers choose one of these on every request. It fills in the work arrangement, working hours and the country to search for
          candidates; the manager can still change them.
        </p>
        <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add location</Button>
      </div>
      <DataTable>
        <TableHeader><TableRow><Th>Location</Th><Th>Country</Th><Th>Arrangement</Th><Th>Working hours</Th><Th>Status</Th><Th /></TableRow></TableHeader>
        <TableBody>
          {q.data.locations.map((l) => (
            <TableRow key={l.id}>
              <Td className="font-medium">{l.name}</Td>
              <Td>{l.country}</Td>
              <Td>{l.workArrangement}</Td>
              <Td className="max-w-xs text-muted-foreground">{l.workingHours || "—"}</Td>
              <Td><Badge tone={l.active ? "good" : "neutral"} dot>{l.active ? "Shown" : "Hidden"}</Badge></Td>
              <Td><Button size="sm" variant="ghost" onClick={() => setEditing(l)}>Edit</Button></Td>
            </TableRow>
          ))}
          {!q.data.locations.length && <TableRow><Td colSpan={6} className="text-center text-muted-foreground">No locations yet.</Td></TableRow>}
        </TableBody>
      </DataTable>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing && <LocationEditor key={editing === "new" ? "new" : editing.id} location={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LocationEditor({ location, onDone }: { location: HiringLocation | null; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(LocationForm), defaultValues: location ? toForm(location) : EMPTY });
  const { errors, isSubmitting } = form.formState;
  const reg = (name: keyof Values) => ({ ...form.register(name), "aria-invalid": !!errors[name] });

  const save = form.handleSubmit(async (body) => {
    try {
      if (location) await call(rpc.locations[":id"].$patch({ param: { id: location.id }, json: body }));
      else await call(rpc.locations.$post({ json: body }));
      await qc.invalidateQueries({ queryKey: ["locations"] });
      toast(location ? "Location saved." : "Location added.");
      onDone();
    } catch (e) {
      form.setError("root", { message: (e as Error).message });
    }
  });

  async function remove() {
    if (!location || !window.confirm(`Delete "${location.name}"? Requests that used it keep their details.`)) return;
    try {
      await call(rpc.locations[":id"].$delete({ param: { id: location.id } }));
      await qc.invalidateQueries({ queryKey: ["locations"] });
      toast("Location deleted.");
      onDone();
    } catch (e) {
      form.setError("root", { message: (e as Error).message });
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{location ? "Edit location" : "Add a location"}</DialogTitle>
        <DialogDescription>These details are suggested on requests for this location.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="As managers will see it, e.g. Zouk Mosbeh, Lebanon." htmlFor="l-name" className="sm:col-span-2" error={errors.name?.message}><Input id="l-name" {...reg("name")} /></Field>
        <Field label="Country" hint="Candidates are searched here by default." htmlFor="l-country" error={errors.country?.message}><Input id="l-country" {...reg("country")} /></Field>
        <Field label="City" htmlFor="l-city" error={errors.city?.message}><Input id="l-city" {...reg("city")} /></Field>
        <Field label="Work arrangement" htmlFor="l-arr" error={errors.workArrangement?.message}>
          <Select id="l-arr" {...reg("workArrangement")}>{[...new Set([...WORK_ARRANGEMENTS, form.watch("workArrangement")])].map((a) => <option key={a}>{a}</option>)}</Select>
        </Field>
        <Field label="Working hours" htmlFor="l-hours" error={errors.workingHours?.message}><Input id="l-hours" placeholder="Mon–Fri 8:00–17:00" {...reg("workingHours")} /></Field>
      </div>
      <FormError>{errors.root?.message}</FormError>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Controller control={form.control} name="active" render={({ field }) => (
          <label className="flex items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} /> Show on requests</label>
        )} />
        <div className="flex gap-2">
          {location && <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>Delete</Button>}
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>{location ? "Save" : "Add location"}</Button>
        </div>
      </div>
    </form>
  );
}
