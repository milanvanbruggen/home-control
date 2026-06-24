"use client";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/app/components/ThemeProvider";

/** App toaster (shadcn/Sonner), themed to match light/dark/system. */
export function Toaster() {
  const { theme } = useTheme();
  return <Sonner theme={theme} position="bottom-center" richColors closeButton />;
}
