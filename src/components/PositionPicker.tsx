import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Position } from "@/lib/types";
import { cn } from "@/lib/utils";
import { summaryOf, yearsLabel } from "@/lib/positions";

type Props = {
  id: string;
  value: string;
  positions: Position[];
  onChange: (title: string) => void;
  /** A saved position was chosen (typing a new title only calls onChange). */
  onPick: (position: Position) => void;
  onBlur?: () => void;
  invalid?: boolean;
};

const ALL = "All";

/** Show the part of `text` matching `query` in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-brand/50 text-foreground">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/**
 * Searchable position picker: type to search titles, departments and summaries, filter by department,
 * pick with mouse or keyboard, or keep the typed text as a new title. WAI-ARIA combobox + listbox.
 */
export function PositionPicker({ id, value, positions, onChange, onPick, onBlur, invalid }: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState(ALL);
  const [active, setActive] = useState(-1);

  // Positions matching the search, before the department filter, so each chip can show how many it holds.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return positions.filter((p) => !q || [p.title, p.department, p.seniority, summaryOf(p.jdText)].some((x) => x.toLowerCase().includes(q)));
  }, [positions, query]);

  const departments = useMemo(() => {
    const counts = new Map<string, number>(positions.map((p) => [p.department, 0]));
    for (const p of searched) counts.set(p.department, (counts.get(p.department) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [positions, searched]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return searched
      .filter((p) => dept === ALL || p.department === dept)
      // Titles that start with the query first, then by department and title.
      .sort((a, b) => Number(!a.title.toLowerCase().startsWith(q)) - Number(!b.title.toLowerCase().startsWith(q)) || a.department.localeCompare(b.department) || a.title.localeCompare(b.title));
  }, [searched, query, dept]);

  const typed = value.trim();
  const isSaved = positions.some((p) => p.title.toLowerCase() === typed.toLowerCase());
  const offerNew = !!typed && !isSaved;
  const optionCount = matches.length + (offerNew ? 1 : 0);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  });

  const show = (q = "") => { setQuery(q); setActive(-1); setOpen(true); };
  // Reopening keeps filtering by typed text; a saved title shows the whole list so it's easy to switch.
  const reopen = () => show(isSaved ? "" : typed);
  const close = () => { setOpen(false); setActive(-1); };
  const pick = (p: Position) => { onChange(p.title); onPick(p); close(); };
  const choose = (i: number) => (i < matches.length ? pick(matches[i]) : close());

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return reopen();
      setActive((i) => Math.min(i + 1, optionCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  }

  // Close only when focus leaves the whole picker, so the department filters stay usable by keyboard.
  function onFocusOut(e: React.FocusEvent) {
    if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) { close(); onBlur?.(); }
  }

  let lastDept = "";
  const grouped = dept === ALL && !query.trim();
  return (
    <div ref={wrapRef} className="relative" onBlur={onFocusOut} onKeyDown={onKeyDown}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder={`Search ${positions.length} saved positions or type a new title`}
        className="pr-9 pl-8"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          show(e.target.value);
          // While typing, the best match is highlighted so Enter picks it (Escape keeps the typed text).
          if (e.target.value.trim()) setActive(0);
        }}
        onFocus={() => !open && reopen()}
        onClick={() => !open && reopen()}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Hide saved positions" : "Show saved positions"}
        className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => { e.preventDefault(); if (open) close(); else { inputRef.current?.focus(); reopen(); } }}
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border bg-popover text-sm shadow-lg">
          <div role="group" aria-label="Filter by department"
            className="flex gap-1.5 overflow-x-auto border-b px-2.5 py-2 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [scrollbar-width:none]">
            {[[ALL, searched.length] as const, ...departments].map(([d, n]) => (
              <button
                key={d}
                type="button"
                aria-pressed={dept === d}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setDept(d); setActive(-1); inputRef.current?.focus(); }}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  dept === d ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  dept !== d && n === 0 && "opacity-40",
                )}
              >
                {d} <span className={cn("ml-0.5 tabular-nums", dept === d ? "text-background/70" : "text-muted-foreground/70")}>{n}</span>
              </button>
            ))}
          </div>

          <ul ref={listRef} id={listId} role="listbox" aria-label="Saved positions" className="max-h-80 overflow-y-auto p-1.5">
            {matches.map((p, i) => {
              const header = grouped && p.department !== lastDept ? p.department : null;
              lastDept = p.department;
              const selected = p.title.toLowerCase() === typed.toLowerCase();
              const summary = summaryOf(p.jdText);
              return (
                <Fragment key={p.id}>
                  {header && (
                    <li role="presentation" aria-hidden className="sticky top-0 z-10 bg-popover/95 px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                      {header}
                    </li>
                  )}
                  <li
                    id={optionId(i)}
                    role="option"
                    aria-selected={selected}
                    aria-label={[p.title, p.seniority, yearsLabel(p), grouped ? "" : p.department].filter(Boolean).join(", ")}
                    className={cn(
                      "relative flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2",
                      i === active && "bg-accent",
                      selected && "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
                    )}
                    onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                    onMouseMove={() => active !== i && setActive(i)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground"><Highlight text={p.title} query={query} /></div>
                      {summary && <div className="truncate text-xs text-muted-foreground">{summary}</div>}
                    </div>
                    <div className="shrink-0 pt-0.5 text-right text-xs text-muted-foreground">
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 font-medium text-foreground/80">{p.seniority}</span>
                      {yearsLabel(p) && <span className="ml-1.5 tabular-nums">{yearsLabel(p)}</span>}
                      {!grouped && <div className="mt-1 text-[11px]">{p.department}</div>}
                    </div>
                  </li>
                </Fragment>
              );
            })}
            {offerNew && (
              <li
                id={optionId(matches.length)}
                role="option"
                aria-selected={false}
                aria-label={`Use “${typed}” as a new title`}
                className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-muted-foreground", active === matches.length && "bg-accent text-foreground")}
                onMouseDown={(e) => { e.preventDefault(); close(); }}
                onMouseMove={() => setActive(matches.length)}
              >
                <Plus className="h-4 w-4 shrink-0" /> Use “<span className="font-medium text-foreground">{typed}</span>” as a new title
              </li>
            )}
            {!matches.length && (
              <li role="presentation" className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground">
                {positions.length ? `No saved position matches${dept === ALL ? "" : ` in ${dept}`}.` : "No saved positions yet. Recruiters add them in Settings."}
              </li>
            )}
          </ul>

          <div className="hidden items-center gap-3 border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground sm:flex" aria-hidden>
            <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
            <span><Kbd><CornerDownLeft className="h-2.5 w-2.5" /></Kbd> choose</span>
            <span><Kbd>esc</Kbd> close</span>
            <span className="ml-auto">Picking one suggests its details. You can change everything.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mr-0.5 inline-grid min-w-4 place-items-center rounded border bg-background px-1 font-sans text-[10px] leading-4">{children}</kbd>;
}
