// App-level building blocks composed from the shadcn components in ./ui.
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { colorIndex, initials } from "@/lib/people";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Field as UiField, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ---------------------------------------------------------------- form helpers

/**
 * A label, the control, an optional hint and the validation error, stacked.
 * `required` adds a coral asterisk (hidden from screen readers, so the field's name stays the label) and
 * marks the control aria-required, which screen readers announce instead.
 */
export function Field({ label, hint, error, htmlFor, children, className, required = false }: { label: string; hint?: string; error?: string; htmlFor?: string; children: React.ReactNode; className?: string; required?: boolean }) {
  const control = required && React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ "aria-required"?: boolean }>, { "aria-required": true }) : children;
  return (
    <UiField className={cn("gap-1.5", className)} data-invalid={error ? true : undefined}>
      {required ? (
        // The asterisk sits next to the label, not inside it, so the field's accessible name stays the label.
        <div className="flex items-center gap-0.5">
          <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
          <span aria-hidden className="text-sm font-medium text-primary" title="Required">*</span>
        </div>
      ) : (
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      )}
      {control}
      {error ? <FieldError className="text-xs">{error}</FieldError> : hint && <FieldDescription className="text-xs">{hint}</FieldDescription>}
    </UiField>
  );
}

/** Message for a form-level (not field-level) error. */
export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="text-sm text-destructive">{children}</p>;
}

/** Full-width native select (shadcn NativeSelect). */
export function Select({ className, children, ...props }: Omit<React.ComponentProps<"select">, "size">) {
  return (
    <NativeSelect className={cn("w-full", className)} {...props}>
      {children}
    </NativeSelect>
  );
}
export { NativeSelectOption as Option };

// ---------------------------------------------------------------- badges

const tones = {
  neutral: "bg-secondary text-muted-foreground",
  info: "bg-sky-100 text-sky-800",
  warn: "bg-amber-100 text-amber-800",
  good: "bg-emerald-100 text-emerald-800",
  bad: "bg-red-100 text-red-800",
  brand: "bg-accent text-primary",
  dark: "bg-ink text-white",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, children, dot = false }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <UiBadge variant="secondary" className={cn("gap-1.5", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </UiBadge>
  );
}

// ---------------------------------------------------------------- tables

/** shadcn Table inside a bordered card. */
export function DataTable({ className, ...props }: React.ComponentProps<typeof Table>) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className={cn("text-sm", className)} {...props} />
    </div>
  );
}
export const Th = ({ className, ...p }: React.ComponentProps<typeof TableHead>) => (
  <TableHead className={cn("text-xs font-medium text-muted-foreground", className)} {...p} />
);
export const Td = ({ className, ...p }: React.ComponentProps<typeof TableCell>) => (
  <TableCell className={cn("py-2.5 align-top whitespace-normal", className)} {...p} />
);

// ---------------------------------------------------------------- overlays

/** Right-hand slide-over panel with a title. */
export function SidePanel({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Centered dialog with a title and optional description. */
export function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? ""}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- feedback

/** `const toast = useToast(); toast("Saved.")` — backed by sonner. */
export function useToast() {
  return React.useCallback((text: string, tone: "ok" | "error" = "ok") => (tone === "error" ? toast.error(text) : toast.success(text)), []);
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-muted-foreground", className)} aria-label="Loading" />;
}

export function ScoreBar({ value, max = 100 }: { value: number | null | undefined; max?: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round((value / Math.max(max, 1)) * 100);
  return (
    <div className="flex min-w-[96px] items-center gap-2">
      <span className="num w-7 text-right font-semibold">{value}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <span className={cn("block h-full rounded-full", scoreColor(pct))} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/** Green for strong, amber for middling, grey for weak. */
export function scoreColor(pct: number) {
  return pct >= 75 ? "bg-success" : pct >= 55 ? "bg-chip-amber" : "bg-muted-foreground/40";
}

const AVATAR_COLORS = ["bg-chip-purple", "bg-chip-teal", "bg-chip-blue", "bg-chip-amber", "bg-chip-pink", "bg-chip-green"];

const DOT_COLORS = AVATAR_COLORS;

/** A department name with a small colored dot; the same department always gets the same color. */
export function DeptDot({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT_COLORS[colorIndex(name, DOT_COLORS.length)])} />
      {name}
    </span>
  );
}

/** A row of pill buttons to filter a list, each with its count. */
export function FilterChips({ label, options, value, onChange }: { label: string; options: { key: string; label: string; count?: number }[]; value: string; onChange: (key: string) => void }) {
  return (
    <div role="group" aria-label={label} className="mb-4 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cn("rounded-full border px-3 py-1 text-sm transition-colors", value === o.key ? "border-ink bg-ink text-white" : "bg-card hover:bg-secondary")}
        >
          {o.label}{o.count != null && <span className={cn("num ml-1", value === o.key ? "text-white/70" : "text-muted-foreground")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Small label + big number, used in metric strips. */
export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num text-xl font-semibold">{value}</div>
    </div>
  );
}

/** Round initials avatar (never a photo). */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs",
        AVATAR_COLORS[colorIndex(name, AVATAR_COLORS.length)],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
