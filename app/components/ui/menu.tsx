"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * Shared dropdown menu: a trigger button that opens a small popover, with
 * outside-click / Escape to close. The trigger content + styling are
 * caller-provided (a big titled switcher, a compact pill, …); the popover and
 * its items look the same everywhere. Used by the light room switcher and the
 * metric range picker so both dropdowns share one pattern.
 */
export function Menu({
  label,
  trigger,
  triggerClassName,
  align = "left",
  width = "w-56",
  className,
  children,
}: {
  /** Accessible name for the trigger button. */
  label: string;
  /** Visible content inside the trigger button. */
  trigger: ReactNode;
  triggerClassName?: string;
  align?: "left" | "right";
  /** Tailwind width class for the popover (e.g. "w-56", "w-28"). */
  width?: string;
  /** Extra classes for the relative wrapper (e.g. "shrink-0"). */
  className?: string;
  /** Menu content; call `close()` after selecting an item. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`relative ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-1 ${width} ${
            align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"
          } animate-in fade-in-0 zoom-in-95 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-1.5 shadow-xl duration-150`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A single menu row: shows a check when selected. */
export function MenuItem({
  selected = false,
  onSelect,
  children,
}: {
  selected?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-foreground/5 ${
        selected ? "font-semibold text-foreground" : "text-foreground/80"
      }`}
    >
      {children}
      {selected && <Check size={15} strokeWidth={3} className="shrink-0 text-foreground" aria-hidden />}
    </button>
  );
}
