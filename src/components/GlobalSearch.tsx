import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RequestStatusBadge } from "./Status";

const ROLE_STATUSES = new Set(["sourcing", "open", "closed"]);

/** Search button in the top bar; ⌘K or Ctrl+K opens it from anywhere. Finds roles and requests by code or title. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ["requests", "search"], queryFn: () => call(rpc.requests.$get({ query: {} })), enabled: open });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = text.trim().toLowerCase();
    const rows = list.data?.requests ?? [];
    const hits = q ? rows.filter((r) => `${r.code} ${r.title} ${r.department}`.toLowerCase().includes(q)) : rows;
    return hits.slice(0, 8);
  }, [list.data, text]);

  function go(i: number) {
    const r = results[i];
    if (!r) return;
    setOpen(false);
    setText("");
    navigate(ROLE_STATUSES.has(r.status) ? `/roles/${r.id}` : `/requests/${r.id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border bg-secondary/70 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search roles and requests</span>
        <kbd className="hidden rounded border bg-card px-1.5 text-[11px] font-medium sm:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Find a role or request by code or title.</DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={text}
              onChange={(e) => { setText(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); go(active); }
              }}
              placeholder="Type a code or title"
              aria-label="Search roles and requests"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
            {results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(i)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm", i === active && "bg-secondary")}
                >
                  <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{r.code}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                  <RequestStatusBadge status={r.status} />
                </button>
              </li>
            ))}
            {!list.isLoading && !results.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing found</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
