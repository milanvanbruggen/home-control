"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Language } from "@/lib/types";
import { t, type MsgKey } from "@/lib/i18n";

type LangContextValue = { lang: Language; setLang: (l: Language) => void };

// Default to English so components used without a provider (e.g. unit tests) still render.
const LangContext = createContext<LangContextValue>({ lang: "en", setLang: () => {} });

export function LanguageProvider({ initial, children }: { initial: Language; children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initial);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    if (typeof document !== "undefined") document.documentElement.lang = l;
    try {
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: l }),
      }).catch(() => {});
    } catch {
      /* no fetch (e.g. jsdom) — language still applied in-memory */
    }
  }, []);

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

/** Returns a translate function bound to the current language. */
export function useT(): (key: MsgKey, params?: Record<string, string | number>) => string {
  const { lang } = useContext(LangContext);
  return useCallback((key: MsgKey, params?: Record<string, string | number>) => t(lang, key, params), [lang]);
}
