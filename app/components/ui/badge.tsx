import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "light" | "muted" | "warn" | "alert";

/** Translucent "glass" status pill for the gradient tiles — the card colour shows
 *  through, tinted per status: `light` (working), `muted` (off), `warn` (starting,
 *  amber), `alert` (capacity / warning, rose). White text + a small dot throughout.
 *  Borderless by design — the leading dot (and the absence of a chevron) is what
 *  reads it as a status chip rather than one of the dropdown pills. */
export function Badge({
  className,
  tone = "muted",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    light: "bg-white/25",
    muted: "bg-black/25",
    warn: "bg-amber-400/40",
    alert: "bg-rose-400/40",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm",
        tones[tone],
        className,
      )}
      {...props}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/70" aria-hidden />
      {props.children}
    </span>
  );
}
