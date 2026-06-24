"use client";
import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * Wraps the active page in a React <ViewTransition> keyed by pathname, so a route
 * change unmounts the old page (exit) and mounts the new one (enter) — that's what
 * makes the directional enter/exit animations fire (a persistent boundary would only
 * "update"). The slide direction comes from the <Link transitionTypes> (nav-forward
 * / nav-back); untyped navigations (initial load, polling) don't animate.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
