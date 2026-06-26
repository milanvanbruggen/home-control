"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Star, Loader2, Thermometer, Droplets, GripVertical, Lightbulb, Gauge, Snowflake, LineChart, Sun } from "lucide-react";
import { toast } from "sonner";
import type { Language, Theme, RoomState, RoomMetrics, MetricKind } from "@/lib/types";
import { formatMetricValue, METRIC_LABEL_KEY } from "@/lib/metrics";
import { useLang, useT } from "@/app/components/LanguageProvider";
import { useTheme } from "@/app/components/ThemeProvider";
import { Card } from "@/app/components/ui/card";
import { Switch } from "@/app/components/ui/switch";
import { sceneGradient } from "@/lib/scene-visuals";
import { orderCardIds } from "@/lib/home-cards";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

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

/** Parse a "0,23" / "0.23" tariff string to a non-negative number, or null. */
function parsePrice(s: string): number | null {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100000) / 100000 : null;
}

function TariffInput({ label, value, onChange, onCommit }: { label: string; value: string; onChange: (v: string) => void; onCommit: (v: string) => void }) {
  const t = useT();
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          placeholder="0,00"
          className="w-20 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-2 text-right text-sm tabular-nums outline-none focus:border-[var(--ring)]"
        />
        <span className="text-xs text-[var(--muted)]">{t("tariff.unit")}</span>
      </span>
    </label>
  );
}

type TariffState = {
  mode: "simple" | "advanced";
  importPrice: string; exportPrice: string;
  importLow: string; importHigh: string; feedInPrice: string; fixedFeedInPerDay: string;
};
const numToStr = (n: number | null | undefined) => (n != null ? String(n).replace(".", ",") : "");

/** Manual electricity tariffs (simple flat or advanced dual-tariff) that power
 *  the Solar widget's cost/earnings row. */
function TariffsCard() {
  const t = useT();
  const [s, setS] = useState<TariffState>({ mode: "simple", importPrice: "", exportPrice: "", importLow: "", importHigh: "", feedInPrice: "", fixedFeedInPerDay: "" });
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { tariff?: Partial<Record<keyof TariffState, number | null>> & { mode?: "simple" | "advanced" } }) => {
        if (!alive || !d.tariff) return;
        const tr = d.tariff;
        setS({
          mode: tr.mode === "advanced" ? "advanced" : "simple",
          importPrice: numToStr(tr.importPrice), exportPrice: numToStr(tr.exportPrice),
          importLow: numToStr(tr.importLow), importHigh: numToStr(tr.importHigh),
          feedInPrice: numToStr(tr.feedInPrice), fixedFeedInPerDay: numToStr(tr.fixedFeedInPerDay),
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  function persist(next: TariffState) {
    fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ tariff: {
        mode: next.mode,
        importPrice: parsePrice(next.importPrice), exportPrice: parsePrice(next.exportPrice),
        importLow: parsePrice(next.importLow), importHigh: parsePrice(next.importHigh),
        feedInPrice: parsePrice(next.feedInPrice), fixedFeedInPerDay: parsePrice(next.fixedFeedInPerDay),
      } }),
    })
      .then((r) => { if (mounted.current) { if (r.ok) toast.success(t("settings.saved")); else toast.error(t("settings.saveError")); } })
      .catch(() => { if (mounted.current) toast.error(t("settings.saveError")); });
  }
  const set = (patch: Partial<TariffState>) => setS((cur) => ({ ...cur, ...patch }));
  const commit = (patch: Partial<TariffState>) => { const next = { ...s, ...patch }; setS(next); persist(next); };

  return (
    <Card aria-label={t("settings.tariffs")}>
      <h2 className="text-lg font-semibold tracking-tight">{t("settings.tariffs")}</h2>
      <div className="mt-3">
        <Segmented
          label={t("settings.tariffs")}
          value={s.mode}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: "simple", label: t("tariff.mode.simple") },
            { value: "advanced", label: t("tariff.mode.advanced") },
          ]}
        />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {s.mode === "simple" ? (
          <>
            <TariffInput label={t("tariff.import")} value={s.importPrice} onChange={(v) => set({ importPrice: v })} onCommit={(v) => commit({ importPrice: v })} />
            <TariffInput label={t("tariff.export")} value={s.exportPrice} onChange={(v) => set({ exportPrice: v })} onCommit={(v) => commit({ exportPrice: v })} />
          </>
        ) : (
          <>
            <TariffInput label={t("tariff.importLow")} value={s.importLow} onChange={(v) => set({ importLow: v })} onCommit={(v) => commit({ importLow: v })} />
            <TariffInput label={t("tariff.importHigh")} value={s.importHigh} onChange={(v) => set({ importHigh: v })} onCommit={(v) => commit({ importHigh: v })} />
            <TariffInput label={t("tariff.feedIn")} value={s.feedInPrice} onChange={(v) => set({ feedInPrice: v })} onCommit={(v) => commit({ feedInPrice: v })} />
            <TariffInput label={t("tariff.fixedFeedIn")} value={s.fixedFeedInPerDay} onChange={(v) => set({ fixedFeedInPerDay: v })} onCommit={(v) => commit({ fixedFeedInPerDay: v })} />
            <p className="text-xs text-[var(--muted)]">{t("tariff.salderingNote")}</p>
          </>
        )}
      </div>
    </Card>
  );
}

type CardType = "lights" | "thermostat" | "chill" | "metric" | "solar";
const TYPE_ICON: Record<CardType, typeof Lightbulb> = {
  lights: Lightbulb,
  thermostat: Gauge,
  chill: Snowflake,
  metric: LineChart,
  solar: Sun,
};
const TYPE_LABEL_KEY = {
  lights: "widget.typeLights",
  thermostat: "widget.typeThermostat",
  chill: "widget.typeClimate",
  metric: "widget.typeMetric",
  solar: "widget.typeSolar",
} as const;

interface CardRow {
  id: string;
  label: string;
  type: CardType;
  room?: RoomMetrics;
}

/** One draggable card row; metric rows expand to toggle their readings. */
function SortableCardRow({
  card,
  expanded,
  onToggleExpand,
  isHidden,
  onToggleMetric,
}: {
  card: CardRow;
  expanded: boolean;
  onToggleExpand: () => void;
  isHidden: (kind: MetricKind) => boolean;
  onToggleMetric: (kind: MetricKind) => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const TypeIcon = TYPE_ICON[card.type];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] ${isDragging ? "shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          aria-label={t("settings.dragHandle")}
          className="-ml-1 flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-foreground/5 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} aria-hidden />
        </button>
        <TypeIcon size={16} className="shrink-0 text-[var(--muted)]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{card.label}</span>
        <span className="shrink-0 text-xs text-[var(--muted)]">{t(TYPE_LABEL_KEY[card.type])}</span>
        {card.room && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={card.label}
            onClick={onToggleExpand}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-foreground/5"
          >
            <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
      </div>
      {card.room && expanded && (
        <ul className="border-t border-[var(--card-border)] px-3 py-2">
          {card.room.metrics.map((m) => {
            const label = t(METRIC_LABEL_KEY[m.kind]);
            return (
              <li key={m.kind} className="flex items-center justify-between gap-3 py-1.5">
                <span className="flex items-center gap-2 text-sm">
                  {m.kind === "temperature" ? (
                    <Thermometer size={16} className="text-[var(--muted)]" aria-hidden />
                  ) : (
                    <Droplets size={16} className="text-[var(--muted)]" aria-hidden />
                  )}
                  {label}
                  <span className="tabular-nums text-[var(--muted)]">{formatMetricValue(m)}</span>
                </span>
                <Switch
                  checked={!isHidden(m.kind)}
                  onCheckedChange={() => onToggleMetric(m.kind)}
                  aria-label={`${card.label} ${label}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** Combined Widgets section: drag to reorder every home card, and expand a metric
 *  card to toggle its readings. Reorder persists `cardOrder`; toggles persist the
 *  `hiddenMetrics` deny-list. */
function WidgetsCard({
  hasLights,
  thermostatName,
  chills,
  metrics,
}: {
  hasLights: boolean;
  thermostatName: string | null;
  chills: { id: string; name: string }[];
  metrics: RoomMetrics[];
}) {
  const t = useT();
  const [saved, setSaved] = useState<string[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Set<MetricKind>>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHidden = useRef<Record<string, string[]> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { cardOrder?: string[] }) => { if (alive) setSaved(s.cardOrder ?? []); })
      .catch(() => { if (alive) setSaved([]); });
    return () => { alive = false; };
  }, []);

  const flushHidden = useCallback(() => {
    const hiddenMetrics = pendingHidden.current;
    if (!hiddenMetrics) return;
    pendingHidden.current = null;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenMetrics }),
      keepalive: true,
    })
      .then((r) => { if (!mounted.current) return; setSaving(false); if (r.ok) toast.success(t("settings.saved")); else toast.error(t("settings.saveError")); })
      .catch(() => { if (!mounted.current) return; setSaving(false); toast.error(t("settings.saveError")); });
  }, [t]);

  useEffect(() => () => { mounted.current = false; flushHidden(); }, [flushHidden]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Effective hidden kinds for a room: the local override if touched, else the
  // server's current visibility.
  function hiddenOf(room: RoomMetrics): Set<MetricKind> {
    return overrides[room.key] ?? new Set(room.metrics.filter((m) => !m.visible).map((m) => m.kind));
  }

  const cards: CardRow[] = [
    { id: "solar", label: t("solar.title"), type: "solar" as const },
    ...(hasLights ? [{ id: "lights", label: t("lights.section"), type: "lights" as const }] : []),
    ...(thermostatName ? [{ id: "thermostat", label: thermostatName, type: "thermostat" as const }] : []),
    ...chills.map((c) => ({ id: c.id, label: c.name, type: "chill" as const })),
    ...metrics.map((r) => ({ id: r.key, label: r.name, type: "metric" as const, room: r })),
  ];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const orderedCards = orderCardIds(cards.map((c) => c.id), saved ?? [])
    .map((id) => byId.get(id))
    .filter((c): c is CardRow => !!c);

  function persistOrder(ids: string[]) {
    setSaving(true);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardOrder: ids }),
      keepalive: true,
    })
      .then((r) => { if (!mounted.current) return; setSaving(false); if (r.ok) toast.success(t("settings.saved")); else toast.error(t("settings.saveError")); })
      .catch(() => { if (!mounted.current) return; setSaving(false); toast.error(t("settings.saveError")); });
  }

  function queueHidden(ov: Record<string, Set<MetricKind>>) {
    const hiddenMetrics: Record<string, string[]> = {};
    for (const room of metrics) {
      const set = ov[room.key] ?? new Set(room.metrics.filter((m) => !m.visible).map((m) => m.kind));
      if (set.size) hiddenMetrics[room.key] = [...set];
    }
    pendingHidden.current = hiddenMetrics;
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushHidden(), 400);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = orderedCards.map((c) => c.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setSaved(next);
    persistOrder(next);
  }

  function toggleMetric(room: RoomMetrics, kind: MetricKind) {
    setOverrides((prev) => {
      const base = prev[room.key] ?? new Set(room.metrics.filter((m) => !m.visible).map((m) => m.kind));
      const set = new Set(base);
      if (set.has(kind)) set.delete(kind);
      else set.add(kind);
      const nextOv = { ...prev, [room.key]: set };
      queueHidden(nextOv);
      return nextOv;
    });
  }

  return (
    <Card aria-label={t("settings.widgets")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("settings.widgets")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("settings.widgetsHint")}</p>
        </div>
        <div className="mt-1 shrink-0 text-xs text-[var(--muted)]" aria-live="polite">
          {saving && (
            <span className="flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" aria-hidden /> {t("climate.saving")}
            </span>
          )}
        </div>
      </div>
      {orderedCards.length === 0 ? (
        <p className="py-4 text-sm text-[var(--muted)]">{t("lights.noRooms")}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={orderedCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="mt-3 flex flex-col gap-2">
              {orderedCards.map((c) => (
                <SortableCardRow
                  key={c.id}
                  card={c}
                  expanded={expandedId === c.id}
                  onToggleExpand={() => setExpandedId((cur) => (cur === c.id ? null : c.id))}
                  isHidden={(kind) => (c.room ? hiddenOf(c.room).has(kind) : false)}
                  onToggleMetric={(kind) => {
                    if (c.room) toggleMetric(c.room, kind);
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();

  const [rooms, setRooms] = useState<RoomState[] | null>(null);
  const [metrics, setMetrics] = useState<RoomMetrics[] | null>(null);
  const [chills, setChills] = useState<{ id: string; name: string }[]>([]);
  const [thermostatName, setThermostatName] = useState<string | null>(null);
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
      .then((s: { rooms?: RoomState[]; metrics?: RoomMetrics[]; chills?: { id: string; name: string }[]; thermostat?: { name: string } | null }) => {
        if (!alive) return;
        const rs = s.rooms ?? [];
        setRooms(rs);
        setMetrics(s.metrics ?? []);
        setChills((s.chills ?? []).map((c) => ({ id: c.id, name: c.name })));
        setThermostatName(s.thermostat?.name ?? null);
        setFavSets(Object.fromEntries(rs.map((r) => [r.key, new Set(r.favorites)])));
        setOpenRoom(rs[0]?.key ?? null);
      })
      .catch(() => { if (alive) { setRooms([]); setMetrics([]); } });
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

      <TariffsCard />

      <WidgetsCard
        hasLights={(rooms?.length ?? 0) > 0}
        thermostatName={thermostatName}
        chills={chills}
        metrics={metrics ?? []}
      />

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
