# Dekking-info + net-stat hernoemen (v4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een tikbaar info-'i' op de Dekking-stat met uitleg, en de live net-stat hernoemd naar Teruglevering/Afname.

**Architecture:** De lokale `Stat` in `SolarCard` krijgt een optionele `info`-prop die een lichtgewicht eigen popover toont (geen nieuwe dependency). De labels komen uit i18n.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest + @testing-library/react.

## Global Constraints

- **Geen nieuwe dependencies** — eigen popover (lokale state + document-listener).
- **i18n in twee talen** — nieuwe/gewijzigde strings in zowel `en` als `nl`.
- **Niet-standaard Next.js 16** (AGENTS.md): client-component, volg het bestaande patroon.
- **Git**: branch `feat/stat-info`. Na de taak `npm test && npx tsc --noEmit && npm run lint` (PRE-EXISTING lint-fouten in ongerelateerde bestanden negeren; geen nieuwe). Commit-trailer:
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BPUtdakJE9JBe1QUhtL51h

---

### Task 1: Info-popover op Dekking + net-stat hernoemen

**Files:**
- Modify: `lib/i18n.ts`
- Modify: `app/components/SolarCard.tsx`
- Test: `app/components/SolarCard.test.tsx` (bestaand — werk de net-label-test bij + voeg toe)

**Interfaces:**
- `Stat` krijgt een optionele prop `info?: string`.

- [ ] **Step 1: Wijzig de i18n-strings**

In `lib/i18n.ts`:
- `en`: `"solar.toGrid": "Feed-in",` (was "To grid"); `solar.fromGrid` blijft `"From grid"`. Voeg toe: `"solar.coverageInfo": "Share of your current usage your panels cover right now.",`.
- `nl`: `"solar.toGrid": "Teruglevering",` (was "Naar net"); `"solar.fromGrid": "Afname",` (was "Van net"). Voeg toe: `"solar.coverageInfo": "Aandeel van je huidige verbruik dat je panelen nu dekken.",`.

- [ ] **Step 2: Schrijf/werk de falende tests bij**

In `app/components/SolarCard.test.tsx`: voeg `fireEvent` toe aan de testing-library import. **Werk de bestaande net-label-test bij**: vervang `screen.getByText("Naar net")` door `screen.getByText("Teruglevering")` (de export-fixture). Voeg toe:

```typescript
it("labels the net stat as Afname when importing", () => {
  render(<SolarCard solar={{ ...solar, netGridKw: 1.0, gridDirection: "import" }} />);
  expect(screen.getByText("Afname")).toBeInTheDocument();
});

it("shows an info popover on the Dekking stat when tapped", () => {
  render(<SolarCard solar={solar} />);
  const btn = screen.getByRole("button", { name: /Uitleg: Dekking/i });
  expect(screen.queryByText(/Aandeel van je huidige verbruik/i)).not.toBeInTheDocument();
  fireEvent.click(btn);
  expect(screen.getByText(/Aandeel van je huidige verbruik/i)).toBeInTheDocument();
});

it("has no info button on the other stats", () => {
  render(<SolarCard solar={solar} />);
  expect(screen.getAllByRole("button", { name: /Uitleg:/i })).toHaveLength(1);
});
```

- [ ] **Step 3: Run tests → verwacht FAIL**

Run: `npm test -- app/components/SolarCard.test.tsx`
Expected: FAIL — "Teruglevering" bestaat nog niet / geen info-knop.

- [ ] **Step 4: Implementeer de `Stat`-popover en bedraad Dekking**

In `app/components/SolarCard.tsx`:
1. Breid de imports uit: `import { useEffect, useRef, useState } from "react";` en voeg `Info` toe aan de lucide-import: `import { Sun, ChevronDown, Info } from "lucide-react";`.
2. Vervang de `Stat`-functie door:

```tsx
function Stat({ k, v, color, info }: { k: string; v: string; color?: string; info?: string }) {
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
    <div ref={ref} className="relative min-w-0 flex-1 rounded-2xl bg-foreground/[0.035] px-2.5 py-2">
      <div className="flex items-center gap-1">
        <span className="truncate text-[0.66rem] uppercase tracking-wide text-[var(--muted)]">{k}</span>
        {info && (
          <button
            type="button"
            aria-label={`Uitleg: ${k}`}
            onClick={() => setOpen((o) => !o)}
            className="ml-auto shrink-0 text-[var(--muted)] transition hover:text-foreground active:scale-90"
          >
            <Info size={11} aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-0.5 truncate text-[0.95rem] font-bold" style={color ? { color } : undefined}>{v}</div>
      {info && open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-10 mb-1 max-w-[12rem] rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-normal normal-case text-foreground shadow-lg"
        >
          {info}
        </div>
      )}
    </div>
  );
}
```

3. Geef de Dekking-`Stat` de `info`-prop (in de stat-rij van `SolarCard`):

```tsx
        <Stat k={t("solar.coverage")} v={`${formatPercent(solar.coveragePct)}%`} info={t("solar.coverageInfo")} />
```

(De net-`Stat` gebruikt al `t("solar.toGrid")`/`t("solar.fromGrid")` — geen codewijziging, alleen de i18n-waarden.)

- [ ] **Step 5: Run tests → verwacht PASS**

Run: `npm test -- app/components/SolarCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Commit.

- [ ] **Step 7: Handmatige rooktest**

Run: dev-server (3009 draait of `npm run dev`). De net-stat toont nu **Teruglevering**/**Afname**; de Dekking-stat heeft een klein 'i'; tik → uitleg-popover; tik buiten/Escape → dicht.

---

## Self-Review

**1. Spec-dekking:** info-'i' alleen op Dekking → Step 4 (alleen die `Stat` krijgt `info`) + test "no info button on the other stats". ✅ Net-stat hernoemd → Step 1 (i18n) + test. ✅ Lichtgewicht popover, geen dependency → Step 4 (lokale state + document-listener, cleanup). ✅ nl+en i18n → Step 1. ✅

**2. Placeholder-scan:** geen TBD/TODO; volledige code; tests asserten echt DOM-gedrag (knop, popover toont/verbergt).

**3. Type-consistentie:** `Stat`-prop `info?: string` consistent met de Dekking-aanroep. `Info` uit lucide-react (zelfde pakket als `Sun`). i18n-sleutel `solar.coverageInfo` in beide talen → `MsgKey` blijft kloppen.
