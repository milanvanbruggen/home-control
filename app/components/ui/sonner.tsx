"use client";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/app/components/ThemeProvider";

/** App toaster (shadcn/Sonner), styled to match the app's cards + teal accent. */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border !border-[var(--card-border)] !bg-[var(--card)] !text-foreground !shadow-xl",
          title: "!font-medium",
          description: "!text-[var(--muted)]",
          closeButton:
            "!rounded-full !border-[var(--card-border)] !bg-[var(--card)] !text-[var(--muted)]",
        },
      }}
    />
  );
}
