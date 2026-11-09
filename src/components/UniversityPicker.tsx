import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, Spinner, useToast } from "@/components/kit";
import { UNIVERSITIES_MAX } from "../../shared/schemas";

/**
 * Optional list of universities: pick a country (starts on the location's), search its accredited universities and
 * tick the ones to search. Names from several countries can be mixed. Nothing ticked means everyone is searched.
 */
export function UniversityPicker({ value, onChange, defaultCountry, canAdd = true, idPrefix = "uni" }: {
  value: string[];
  onChange: (names: string[]) => void;
  defaultCountry?: string | null;
  canAdd?: boolean;
  idPrefix?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const countries = useQuery({ queryKey: ["university-countries"], queryFn: () => call(rpc.universities.countries.$get()), staleTime: 5 * 60_000 });
  const [country, setCountry] = useState(defaultCountry ?? "");
  const [search, setSearch] = useState("");
  // Follow the location's country until someone picks another one.
  const [chosenCountry, setChosenCountry] = useState(false);
  useEffect(() => { if (!chosenCountry && defaultCountry) setCountry(defaultCountry); }, [defaultCountry, chosenCountry]);

  const list = useQuery({
    queryKey: ["universities", country],
    queryFn: () => call(rpc.universities.$get({ query: { country } })),
    enabled: country.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
  const options = countries.data?.countries ?? [];
  const countryOptions = [...new Set([...options.map((c) => c.country), ...(country ? [country] : [])])].sort();

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    const all = list.data?.universities ?? [];
    return s ? all.filter((u) => u.name.toLowerCase().includes(s) || u.aka.some((a) => a.toLowerCase().includes(s)) || (u.city ?? "").toLowerCase().includes(s)) : all;
  }, [list.data, search]);
  const selected = new Set(value.map((v) => v.toLowerCase()));
  const exact = (list.data?.universities ?? []).some((u) => u.name.toLowerCase() === search.trim().toLowerCase());
  const full = value.length >= UNIVERSITIES_MAX;

  const toggle = (name: string) => {
    if (selected.has(name.toLowerCase())) onChange(value.filter((v) => v.toLowerCase() !== name.toLowerCase()));
    else if (!full) onChange([...value, name]);
  };

  async function add() {
    const name = search.trim();
    if (name.length < 3 || !country) return;
    try {
      const { university } = await call(rpc.universities.$post({ json: { country, name } }));
      await qc.invalidateQueries({ queryKey: ["universities", country] });
      qc.invalidateQueries({ queryKey: ["university-countries"] });
      if (!full) onChange([...value, university.name]);
      setSearch("");
      toast(`Added ${university.name} to ${country}.`);
    } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Chosen universities">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs">
              {v}
              <button type="button" aria-label={`Remove ${v}`} className="rounded-full p-0.5 hover:bg-card" onClick={() => toggle(v)}><X className="size-3" /></button>
            </span>
          ))}
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onChange([])}>Clear all</Button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
        <Select id={`${idPrefix}-country`} aria-label="University country" value={country} onChange={(e) => { setCountry(e.target.value); setChosenCountry(true); setSearch(""); }}>
          <option value="">Choose a country</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}{options.find((o) => o.country === c) ? ` (${options.find((o) => o.country === c)!.count})` : ""}</option>)}
        </Select>
        <Input id={`${idPrefix}-search`} aria-label="Search universities" placeholder={country ? `Search universities in ${country}` : "Choose a country first"} value={search} disabled={!country} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {country && (
        <div className="max-h-56 overflow-y-auto rounded-md border" role="group" aria-label={`Universities in ${country}`}>
          {list.isLoading ? <div className="p-3"><Spinner /></div> : (
            <>
              {shown.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-start gap-2 border-b px-3 py-1.5 text-sm last:border-b-0 hover:bg-secondary/50">
                  <input type="checkbox" className="mt-1" checked={selected.has(u.name.toLowerCase())} disabled={full && !selected.has(u.name.toLowerCase())} onChange={() => toggle(u.name)} />
                  <span>
                    {u.name}
                    <span className="text-xs text-muted-foreground">{[u.aka.join(", "), u.city].filter(Boolean).length ? ` · ${[u.aka.join(", "), u.city].filter(Boolean).join(" · ")}` : ""}</span>
                  </span>
                </label>
              ))}
              {!shown.length && <p className="px-3 py-2 text-sm text-muted-foreground">{search ? "No university matches." : "No universities saved for this country yet."}</p>}
            </>
          )}
        </div>
      )}
      {canAdd && country && search.trim().length >= 3 && !exact && (
        <div><Button type="button" size="sm" variant="outline" onClick={add}><Plus /> Add "{search.trim()}" to {country}</Button></div>
      )}
      {full && <p className="text-xs text-muted-foreground">At most {UNIVERSITIES_MAX} universities.</p>}
    </div>
  );
}
