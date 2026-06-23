import * as React from "react";
import { cn } from "@/lib/utils";

/** shadcn-style surface card: white by default; climate tiles override the
 *  background with a gradient via `style`. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5",
        "shadow-[0_18px_40px_-28px_rgba(27,43,70,0.35)]",
        className,
      )}
      {...props}
    />
  );
}
