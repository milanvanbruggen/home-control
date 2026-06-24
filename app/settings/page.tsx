"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Language, Theme, RoomState } from "@/lib/types";
import { useLang, useT } from "@/app/components/LanguageProvider";
import { useTheme } from "@/app/components/ThemeProvider";
import { Card } from "@/app/components/ui/card";
import { Switch } from "@/app/components/ui/switch";
import { sceneGradient } from "@/lib/scene-visuals";

/** iOS-style segmented control that reads well on the card surface, light + dark. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-foreground/[0.06] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] flex-1 rounded-full px-2 text-sm font-medium transition active:scale-[0.98] ${
              active ? "bg-[var(--card)] text-foreground shadow-sm" : "text-[var(--muted)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Toggle + test the LaMetric water-reservoir alert (the in-house notification). */
function NotificationsCard() {
  const t = useT();
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { waterAlert?: boolean }) => alive && setEnabled(s.waterAlert !== false))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(next: boolean) {
    setEnabled(next);
    setBusy(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waterAlert: next }),
      });
      if (!r.ok) throw new Error();
      toast.success(t("settings.saved"));
    } catch {
      setEnabled(!next);
      toast.error(t("settings.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const r = await fetch("/api/notify-test", { method: "POST" });
      if (!r.ok) throw new Error();
      toast.success(t("settings.testSent"));
    } catch {
      toast.error(t("settings.testError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-label={t("settings.notifications")}>
      <h2 className="text-lg font-semibold tracking-tight">{t("settings.notifications")}</h2>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t("settings.waterAlert")}</p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{t("settings.waterAlertHint")}</p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          onCheckedChange={(v) => toggle(v)}
          aria-label={t("settings.waterAlert")}
        />
      </div>
      <button
        type="button"
        onClick={test}
        disabled={busy}
        className="mt-3 text-sm font-medium text-[var(--muted)] underline-offset-2 hover:underline disabled:opacity-50"
      >
        {t("settings.test")}
      </button>
    </Card>
  );
}

export default function SettingsPage() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();

  const [rooms, setRooms] = useState<RoomState[] | null>(null);
  const [favSets, setFavSets] = useState<Record<string, Set<string>>>({});
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFav = useRef<Record<string, string[]> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/state")
      .then((r) => r.json())
      .then((s: { rooms?: RoomState[] }) => {
        if (!alive) return;
        const rs = s.rooms ?? [];
        setRooms(rs);
        setFavSets(Object.fromEntries(rs.map((r) => [r.key, new Set(r.favorites)])));
        setOpenRoom(rs[0]?.key ?? null);
      })
      .catch(() => alive && setRooms([]));
    return () => {
      alive = false;
    };
  }, []);

  // Persist the FULL favorites map (every room, in scene order). `keepalive` so a
  // flush triggered by navigating away still completes.
  const flushFavorites = useCallback(() => {
    const favorites = pendingFav.current;
    if (!favorites) return;
    pendingFav.current = null;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites }),
      keepalive: true,
    })
      .then((r) => {
        if (!mounted.current) return;
        setSaving(false);
        if (r.ok) toast.success(t("settings.saved"));
        else toast.error(t("settings.saveError"));
      })
      .catch(() => {
        if (!mounted.current) return;
        setSaving(false);
        toast.error(t("settings.saveError"));
      });
  }, [t]);

  // Flush any pending favorites save on unmount so a last-second toggle isn't lost.
  useEffect(
    () => () => {
      mounted.current = false;
      flushFavorites();
    },
    [flushFavorites],
  );

  const queueFavorites = useCallback(
    (sets: Record<string, Set<string>>, rs: RoomState[]) => {
      const favorites: Record<string, string[]> = {};
      for (const r of rs) favorites[r.key] = r.scenes.filter((s) => sets[r.key]?.has(s.id)).map((s) => s.id);
      pendingFav.current = favorites;
      setSaving(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flushFavorites(), 400);
    },
    [flushFavorites],
  );

  function toggleFav(roomKey: string, sceneId: string) {
    setFavSets((prev) => {
      const set = new Set(prev[roomKey]);
      if (set.has(sceneId)) set.delete(sceneId);
      else set.add(sceneId);
      const next = { ...prev, [roomKey]: set };
      if (rooms) queueFavorites(next, rooms);
      return next;
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-10 pt-8">
      <header className="flex items-center gap-2 px-1">
        <Link
          href="/"
          transitionTypes={["nav-back"]}
          aria-label={t("settings.back")}
          className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-foreground/5 hover:text-foreground active:scale-95"
        >
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <h1 className="font-display text-3xl font-medium tracking-tight">{t("settings.title")}</h1>
      </header>

      <Card aria-label={t("settings.language")}>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">{t("settings.language")}</h2>
        <Segmented
          label={t("settings.language")}
          value={lang}
          onChange={(v) => {
            setLang(v as Language);
            toast.success(t("settings.saved"));
          }}
          options={[
            { value: "en" as Language, label: "English" },
            { value: "nl" as Language, label: "Nederlands" },
          ]}
        />
      </Card>

      <Card aria-label={t("settings.theme")}>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">{t("settings.theme")}</h2>
        <Segmented
          label={t("settings.theme")}
          value={theme}
          onChange={(v) => {
            setTheme(v as Theme);
            toast.success(t("settings.saved"));
          }}
          options={[
            { value: "light" as Theme, label: t("settings.themeLight") },
            { value: "dark" as Theme, label: t("settings.themeDark") },
            { value: "system" as Theme, label: t("settings.themeSystem") },
          ]}
        />
      </Card>

      <NotificationsCard />

      <Card aria-label={t("settings.favorites")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("settings.favorites")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("settings.favoritesHint")}</p>
          </div>
          <div className="mt-1 shrink-0 text-xs text-[var(--muted)]" aria-live="polite">
            {saving && (
              <span className="flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" aria-hidden /> {t("climate.saving")}
              </span>
            )}
          </div>
        </div>

        {rooms === null ? (
          <div className="flex justify-center py-8" role="status" aria-label={t("app.loading")}>
            <Loader2 className="animate-spin text-[var(--muted)]" aria-hidden />
          </div>
        ) : rooms.length === 0 ? (
          <p className="py-4 text-sm text-[var(--muted)]">{t("lights.noRooms")}</p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--card-border)]">
            {rooms.map((r) => {
              const open = openRoom === r.key;
              const count = favSets[r.key]?.size ?? 0;
              return (
                <div key={r.key}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenRoom(open ? null : r.key)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 py-3 text-left"
                  >
                    <span className="font-medium">{r.name}</span>
                    <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <span className="tabular-nums">{count}</span>
                      <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                    </span>
                  </button>
                  {open && (
                    <ul className="pb-2">
                      {r.scenes.length === 0 && <li className="py-2 text-sm text-[var(--muted)]">—</li>}
                      {r.scenes.map((s) => {
                        const fav = favSets[r.key]?.has(s.id) ?? false;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              aria-pressed={fav}
                              onClick={() => toggleFav(r.key, s.id)}
                              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left transition hover:bg-foreground/5"
                            >
                              <span
                                aria-hidden
                                className="h-7 w-7 shrink-0 rounded-lg"
                                style={{ backgroundImage: s.gradient ?? sceneGradient(s.id, s.name) }}
                              />
                              <span className="flex-1 text-sm">{s.name}</span>
                              <Star
                                size={18}
                                aria-hidden
                                className={fav ? "fill-[#f0b25a] text-[#f0b25a]" : "text-[var(--muted)]"}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}
