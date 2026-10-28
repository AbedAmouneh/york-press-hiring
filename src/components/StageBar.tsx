import { cn } from "@/lib/utils";
import { STAGES } from "@/lib/home";

/** Four segments, filled up to the current stage (1–4), with the stage name above. */
export function StageBar({ stage, className }: { stage: number; className?: string }) {
  const label = STAGES[stage - 1] ?? "Not started";
  return (
    <div className={cn("w-40 shrink-0", className)} role="img" aria-label={`Stage: ${label}`}>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="flex gap-1">
        {STAGES.map((s, i) => <span key={s} className={cn("h-1.5 flex-1 rounded-full", i < stage ? "bg-primary" : "bg-secondary")} />)}
      </div>
    </div>
  );
}
