import * as React from "react";
import { cn } from "@/lib/utils";

/** shadcn-style surface card with a soft border + elevation. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--card-border)] bg-[var(--card)]/80 p-5",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_20px_40px_-24px_rgba(0,0,0,0.8)]",
        "backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
