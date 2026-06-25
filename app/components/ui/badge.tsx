import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "warn" | "alert";

/** Small status pill for the gradient tiles. `neutral` is a translucent chip that
 *  blends into the card colour (for quiet states like working / off — it just darkens
 *  whatever gradient sits behind it); `warn` / `alert` fill the badge with a distinct
 *  status colour (dark text on a light tint, legible on any card). */
export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-black/20 text-white ring-1 ring-inset ring-white/15 backdrop-blur-sm",
    warn: "bg-amber-100 text-amber-900 ring-1 ring-amber-900/10 shadow-sm",
    alert: "bg-rose-100 text-rose-800 ring-1 ring-rose-900/10 shadow-sm",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      {tone === "neutral" && <span className="h-1.5 w-1.5 rounded-full bg-white/60" aria-hidden />}
      {props.children}
    </span>
  );
}
