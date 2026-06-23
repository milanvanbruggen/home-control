import * as React from "react";
import { cn } from "@/lib/utils";

/** Small status pill. `tone` colours the dot + text. */
export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "cool" | "heat" | "warn" }) {
  const dot =
    tone === "cool" ? "bg-[var(--accent-cool)]"
    : tone === "heat" ? "bg-[var(--accent-heat)]"
    : tone === "warn" ? "bg-[var(--accent-warn)]"
    : "bg-white/40";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05]",
        "px-2.5 py-1 text-xs font-medium text-[var(--muted)]",
        className,
      )}
      {...props}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
      {props.children}
    </span>
  );
}
