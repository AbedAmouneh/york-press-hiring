import { useState } from "react";
import { cn } from "@/lib/utils";

/** Shows /brand/logo.png when it exists, otherwise the York Press wordmark. */
export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  const [img, setImg] = useState(true);
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {img ? (
        <img src="/brand/logo.png" alt="York Press" className="h-9 w-auto rounded" onError={() => setImg(false)} />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-md bg-brand text-lg font-black text-ink">Y</span>
      )}
      <div className="leading-tight">
        <div className={cn("text-[15px] font-bold tracking-tight", dark ? "text-white" : "text-foreground")}>York Press</div>
        <div className={cn("text-[11px] font-medium uppercase tracking-[0.14em]", dark ? "text-white/60" : "text-muted-foreground")}>Hiring</div>
      </div>
    </div>
  );
}
