import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { addValue, removeValue, toggleValue } from "@/lib/multi";
import { cn } from "@/lib/utils";

/** `group` puts options under a heading. */
export type MultiOption = { label: string; group?: string };

type Props = {
  id: string;
  values: string[];
  options: MultiOption[];
  onChange: (values: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  /** Accessible name of the list, e.g. "Countries". */
  listLabel: string;
};

/**
 * Pick several values from a list, or type your own (WAI-ARIA combobox with a multi-select list popup).
 * Chosen values show as chips. Typing highlights the first match, which Enter picks; with no match, Enter adds the
 * text as typed. A comma always adds the text as typed. Backspace in an empty box removes the last chip.
 */
export function MultiSelect({ id, values, options, onChange, onBlur, placeholder, invalid, listLabel }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const labels = useMemo(() => options.map((o) => o.label), [options]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [query, options]);
  const isChosen = (label: string) => values.some((v) => v.toLowerCase() === label.toLowerCase());
  const exact = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  const show = () => { setActive(-1); setOpen(true); };
  const commit = (text = query) => { const next = addValue(values, text, labels); if (next !== values) onChange(next); setQuery(""); setActive(-1); };
  const toggle = (label: string) => { onChange(toggleValue(values, label)); setQuery(""); setActive(-1); inputRef.current?.focus(); };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return show();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && shown[active]) { e.preventDefault(); toggle(shown[active].label); }
      else if (query.trim()) { e.preventDefault(); commit(); }
    } else if (e.key === "," || e.key === "Tab") {
      if (query.trim()) { if (e.key === ",") e.preventDefault(); commit(); }
    } else if (e.key === "Backspace" && !query && values.length) {
      onChange(values.slice(0, -1));
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  let lastGroup = "";
  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent py-1 pl-1.5 pr-9 text-base transition-colors md:text-sm dark:bg-input/30",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          invalid && "border-destructive ring-3 ring-destructive/20",
        )}
        onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); inputRef.current?.focus(); show(); } }}
      >
        {values.map((v) => (
          <span key={v.toLowerCase()} className="inline-flex max-w-full items-center gap-0.5 rounded-md bg-secondary py-0.5 pl-2 pr-0.5 text-sm">
            <span className="truncate">{v}</span>
            <button
              type="button"
              aria-label={`Remove ${v}`}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(removeValue(values, v)); inputRef.current?.focus(); }}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={invalid}
          autoComplete="off"
          placeholder={values.length ? undefined : placeholder}
          className="h-6 min-w-[7rem] flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(e) => {
            // Highlight the first match so Enter picks it; with no match, Enter adds the text as typed.
            const q = e.target.value.trim().toLowerCase();
            setQuery(e.target.value);
            setOpen(true);
            setActive(q && options.some((o) => o.label.toLowerCase().includes(q)) ? 0 : -1);
          }}
          onFocus={show}
          onClick={() => !open && show()}
          onKeyDown={onKeyDown}
          onBlur={() => { if (query.trim()) commit(); setOpen(false); onBlur?.(); }}
        />
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? `Hide ${listLabel.toLowerCase()}` : `Show ${listLabel.toLowerCase()}`}
        className="absolute right-0 top-0 grid h-8 w-9 place-items-center text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => { e.preventDefault(); if (open) setOpen(false); else { inputRef.current?.focus(); show(); } }}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          aria-multiselectable="true"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {shown.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group ?? "";
            const chosen = isChosen(o.label);
            return (
              <li key={`${o.group ?? ""}-${o.label}`} role="presentation">
                {header && <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden>{header}</div>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={chosen}
                  className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5", i === active && "bg-accent")}
                  onMouseDown={(e) => { e.preventDefault(); toggle(o.label); }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span>{o.label}</span>
                  {chosen && <Check className="h-4 w-4 shrink-0" />}
                </div>
              </li>
            );
          })}
          {!shown.length && (
            <li role="presentation" className="px-2 py-2 text-muted-foreground">
              Nothing in the list matches. Press Enter to add “{query.trim()}” as typed.
            </li>
          )}
          {!!shown.length && query.trim() && !exact && (
            <li role="presentation" className="border-t px-2 pb-1 pt-2 text-xs text-muted-foreground">
              Enter picks the highlighted one. Type a comma to add “{query.trim()}” as typed.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
