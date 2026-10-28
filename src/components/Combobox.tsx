import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** `group` puts options under a heading; `detail` is shown greyed after the label. */
export type ComboOption = { id: string; label: string; detail?: string; group?: string };

type Props = {
  id: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  /** Called when an option is chosen from the list (not when text is typed). */
  onPick?: (option: ComboOption) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  /** Accessible name of the list, e.g. "Saved positions". */
  listLabel: string;
  /** Shown when nothing is saved yet. */
  emptyText?: string;
};

/**
 * Pick from a list or type anything (WAI-ARIA combobox with a list popup).
 * Typing filters the list by label, detail or group; the typed text is always kept as the value.
 */
export function Combobox({ id, value, options, onChange, onPick, onBlur, placeholder, invalid, listLabel, emptyText = "Nothing saved yet." }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => [o.label, o.detail, o.group].some((x) => x?.toLowerCase().includes(q)));
  }, [filter, options]);
  const exact = options.some((o) => o.label.toLowerCase() === value.trim().toLowerCase());

  const show = (q = "") => { setFilter(q); setActive(-1); setOpen(true); };
  const pick = (o: ComboOption) => { onChange(o.label); onPick?.(o); setOpen(false); setActive(-1); };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return show();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && active >= 0 && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  let lastGroup = "";
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder={placeholder}
        className="pr-9"
        value={value}
        onChange={(e) => { onChange(e.target.value); show(e.target.value); }}
        onFocus={() => show()}
        onClick={() => !open && show()}
        onKeyDown={onKeyDown}
        onBlur={() => { setOpen(false); onBlur?.(); }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? `Hide ${listLabel.toLowerCase()}` : `Show ${listLabel.toLowerCase()}`}
        className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => { e.preventDefault(); if (open) setOpen(false); else { inputRef.current?.focus(); show(); } }}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {shown.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group ?? "";
            const selected = o.label.toLowerCase() === value.trim().toLowerCase();
            return (
              <li key={o.id} role="presentation">
                {header && <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden>{header}</div>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5", i === active && "bg-accent")}
                  onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span>{o.label}{o.detail && <span className="text-muted-foreground"> · {o.detail}</span>}</span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </div>
              </li>
            );
          })}
          {!shown.length && (
            <li role="presentation" className="px-2 py-2 text-muted-foreground">
              {value.trim() ? <>Nothing in the list matches. “{value.trim()}” will be used as typed.</> : emptyText}
            </li>
          )}
          {!!shown.length && value.trim() && !exact && (
            <li role="presentation" className="border-t px-2 pb-1 pt-2 text-xs text-muted-foreground">
              Or keep typing: “{value.trim()}” will be used as typed.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
