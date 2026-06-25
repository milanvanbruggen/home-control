import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "ok" | "warn" | "alert";

/** Small status pill for the gradient tiles. `neutral` is a frosted white chip
 *  with a dot; the themed tones fill the whole badge with a soft status colour
 *  (dark text on a light tint, so it stays legible on any card gradient). */
export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border border-white/25 bg-white/20 text-white backdrop-blur-sm",
    ok: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-900/10 shadow-sm",
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
      {tone === "neutral" && <span className="h-1.5 w-1.5 rounded-full bg-white/70" aria-hidden />}
      {props.children}
    </span>
  );
}
