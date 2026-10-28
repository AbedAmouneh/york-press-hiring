import { cn } from "@/lib/utils";
import { STAGES } from "@/lib/home";

/** Four segments, filled up to the current stage (1–4), with the stage name above. A closed role shows grey. */
export function StageBar({ stage, closed = false, className }: { stage: number; closed?: boolean; className?: string }) {
  const label = closed ? "Closed" : STAGES[stage - 1] ?? "Not started";
  return (
    <div className={cn("w-40 shrink-0", className)} role="img" aria-label={`Stage: ${label}`}>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="flex gap-1">
        {STAGES.map((s, i) => <span key={s} className={cn("h-1.5 flex-1 rounded-full", i < stage ? (closed ? "bg-muted-foreground/40" : "bg-primary") : "bg-secondary")} />)}
      </div>
    </div>
  );
}
