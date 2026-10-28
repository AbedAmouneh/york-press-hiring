import { useState } from "react";
import { cn } from "@/lib/utils";

/** The official York Press logo (/brand/logo.png) with a small "Hiring" label. Falls back to a wordmark if the file is missing. */
export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  const [img, setImg] = useState(true);
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {img ? (
        <img src="/brand/logo.png" alt="York Press" width={58} height={36} className="h-9 w-auto rounded-md" onError={() => setImg(false)} />
      ) : (
        <span className="text-[15px] font-bold tracking-tight">York Press</span>
      )}
      <span className={cn("text-[11px] font-medium uppercase tracking-[0.14em]", dark ? "text-white/60" : "text-muted-foreground")}>Hiring</span>
    </div>
  );
}
