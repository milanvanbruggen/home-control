# Ontwerp: Uitleg-'i' op Dekking + net-stat hernoemen (v4)

**Datum:** 2026-06-26
**Status:** Goedgekeurd (ontwerp) — klaar voor implementatieplan

## Doel

Twee kleine widget-verbeteringen in de SolarCard:
1. Een tikbaar **info-'i'** op de **Dekking**-stat met een één-regel-uitleg (Dekking is de minst voor-de-hand-liggende term).
2. De live net-stat hernoemen naar **Teruglevering** (export) / **Afname** (import) — consistent met de tarief-/kosten-terminologie.

## Niet-doelen (YAGNI)

- Info-'i' op de andere stats (alleen Dekking).
- Een generiek/herbruikbaar info-component buiten de SolarCard (het patroon is later te kopiëren).
- Een externe popover/tooltip-dependency (we bouwen lichtgewicht, geen nieuwe package).

## Wijzigingen

### i18n (`lib/i18n.ts`)
- `solar.toGrid`: nl "Naar net" → **"Teruglevering"**; en "To grid" → **"Feed-in"**.
- `solar.fromGrid`: nl "Van net" → **"Afname"**; en "From grid" → "From grid".
- Nieuw `solar.coverageInfo`: nl **"Aandeel van je huidige verbruik dat je panelen nu dekken."** / en **"Share of your current usage your panels cover right now."**

### `Stat` (lokaal in `app/components/SolarCard.tsx`)
Voeg een optionele prop `info?: string` toe. Wanneer gezet:
- Render naast het label een klein **info-knopje** (lucide `Info`, ~11px, `text-[var(--muted)]`), met `aria-label` (bv. `"Uitleg: Dekking"`).
- Tik → toont een **kleine glass-popover** met de uitlegtekst; tik opnieuw of buiten → dicht; `Escape` → dicht.
- Popover: zelfstandig, lichtgewicht — lokale `open`-state, sluit op `document` `mousedown` buiten de popover en op `Escape`. Stijl: `bg-[var(--card)]`, `border border-[var(--card-border)]`, `rounded-xl`, subtiele shadow, `text-xs`, `max-w-[12rem]`, absoluut gepositioneerd boven de tegel. `role="tooltip"`.
Tegels zónder `info` blijven exact zoals nu.

### Bedrading
De **Dekking**-`Stat` krijgt `info={t("solar.coverageInfo")}`. De overige stats ongewijzigd. De net-`Stat` gebruikt automatisch de hernoemde labels via `t("solar.toGrid")`/`t("solar.fromGrid")` (geen codewijziging nodig, alleen de i18n-waarden).

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Geen `info` op een stat | Geen 'i', geen popover (ongewijzigd) |
| Popover open, tik buiten | Dicht (document mousedown listener) |
| Popover open, Escape | Dicht |
| Unmount terwijl open | Listener opgeruimd in effect-cleanup |

## Tests (`app/components/SolarCard.test.tsx`)

- Net-stat toont **"Teruglevering"** bij de export-fixture (en "Afname" bij een import-fixture).
- De Dekking-stat heeft een info-knop (via `aria-label`); de andere stats niet.
- Tik op de info-knop toont de uitlegtekst; tik op een buiten-element sluit 'm weer.

## Aannames / te verifiëren in de planfase

- Geen bestaande popover/tooltip-primitive vereist; lichtgewicht eigen implementatie (geen nieuwe dependency).
- `lucide-react` `Info`-icoon bestaat (zelfde pakket als `Sun`/`ChevronDown`).
- AGENTS.md: client-componentwijziging, volg het bestaande patroon.
