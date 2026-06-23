# Bezoekers-bediening (Visitor Home Control) — Ontwerp

- **Datum:** 2026-06-23
- **Status:** Goedgekeurd ontwerp (gereed voor implementatieplan)
- **Repo:** https://github.com/milanvanbruggen/home-control.git

## 1. Doel & context

Een web-app (PWA) waarmee bezoekers in huis eenvoudig een aantal apparaten kunnen
bedienen **zonder een app te installeren**. Bezoeker scant een QR bij de deur,
opent de PWA in de eigen browser en bedient verlichting en klimaat.

Aanleiding: het makkelijk kunnen bedienen van de Quatt Chill-units. Uit voorafgaand
onderzoek (zie §13) blijkt dat de Quatt Chill geen officiële API heeft, maar wel
betrouwbaar te besturen is via **Home Assistant** (de community-integratie
`marcoboers/home-assistant-quatt`, met Remote API ingeschakeld). HA draait al in huis.

## 2. Requirements (vastgelegde keuzes)

| Onderwerp | Keuze |
|---|---|
| Hub | Home Assistant draait al |
| Te bedienen | Quatt Chill (Zolder + Speelkamer), thermostaat, woonkamer-verlichting |
| Bedieningsstijl | Detailbediening klimaat + vaste Hue-scene-knoppen voor licht |
| Toegang | QR → eigen telefoon, PWA, geen installatie |
| Bereik | Alleen lokaal wifi (geen internet-blootstelling van de app) |
| Beveiliging | Geen toegangscode; backend staat **alleen** whitelisted acties toe |
| Platform | PWA (geen native iOS-app) |

## 3. Niet-doelen (out of scope / YAGNI)

- Geen native iOS/Android-app.
- Geen toegang van buitenshuis (geen tunnel/Nabu Casa in v1).
- Geen toegangscode/login voor bezoekers.
- Geen per-lamp dimmen of kleurkiezen — verlichting gaat **uitsluitend** via de 8
  vaste woonkamer-Hue-scenes.
- Geen combinatie-sferen die licht én klimaat tegelijk zetten.
- Geen muziek/TV/sloten/camera's — die zitten bewust niet in de whitelist.
- Geen bediening van de Quatt-warmtepomp-instellingen zelf (alleen Chill + thermostaat).

## 4. Architectuur

```
  Bezoeker (eigen telefoon, op gast-wifi)
        │  scant QR → opent PWA in browser
        ▼
  ┌─────────────────────────────────────────┐
  │  Bezoekers-app  (Next.js, 1 container)   │   ← draait náást HA op de HA-host
  │  ┌─ Frontend (PWA) ──┐  ┌─ /api proxy ─┐ │
  │  │ klimaat + scenes  │→ │ whitelist +   │ │
  │  │ mobile-first UI   │  │ validatie     │ │
  │  └───────────────────┘  └──────┬────────┘ │
  └────────────────────────────────│──────────┘
                                    │  HA REST + long-lived token (server-side, env)
                                    ▼
  ┌─────────────────────────────────────────┐
  │  Home Assistant                          │
  │   ├─ Quatt-integratie → Chill (climate)  │   (Chill-write reist door naar Quatt-cloud)
  │   ├─ climate.thermostaat                 │
  │   └─ Hue scenes (scene.*)                │
  └─────────────────────────────────────────┘
```

- **Eén Next.js-app** levert zowel de PWA-frontend als de `/api`-proxy.
- De `/api`-laag is **de beveiligingsgrens**: de HA-token staat alleen server-side
  (env-var), nooit in de browser. De proxy biedt enkel whitelisted acties en
  valideert alles server-side. Iemand op het wifi-netwerk kan daardoor hooguit de
  toegestane lampen/klimaat bedienen — nooit de rest van HA.
- **Lokaal-only:** de container luistert op het LAN; QR wijst naar
  `https://<host>.local` (of een vast IP). Geen internet-blootstelling.

## 5. Componenten

### ① Frontend — de PWA (`app/`)
- Next.js App Router + TypeScript + Tailwind + shadcn/ui, **mobile-first**.
- PWA-laag: `manifest.json` (standalone, icons, themekleur) + service worker die de
  app-shell cachet en een nette "geen verbinding"-staat toont als wifi wegvalt.
- Donkere, minimalistische stijl in lijn met de Quatt-app (pill-toggles, witte
  selectie). Exacte visuele uitwerking gebeurt in de bouwfase via de
  frontend-design-skill.

### ② Backend — de proxy (`app/api/`)
- `GET /api/state` → opgeschoonde momentopname van alleen whitelisted entities.
- `POST /api/climate` → bedient zowel Chill als thermostaat (beide HA `climate`).
- `POST /api/scene` → activeert een whitelisted Hue-scene.
- `lib/ha-client.ts`: dunne wrapper om de HA-REST-API (`getStates`, `callService`),
  token uit env.

### ③ HA-config (eenmalig, handmatig)
- Quatt-integratie geïnstalleerd + **Remote API ingeschakeld** (eenmalig CiC-knop
  pairen) → Chill climate-entities bestaan en zijn bestuurbaar.
- Long-lived access token in HA aanmaken → in de app-env (`HA_TOKEN`).
- De 8 woonkamer-Hue-scenes bestaan als `scene.*`-entities (uit de Hue-integratie).

## 6. Datamodel & config

`config/devices.ts` is de **single source of truth** en daarmee de whitelist. Eén
bestand aanpassen = apparaat/scene toevoegen of weghalen. Echte entity-id's worden
tijdens de bouw uit HA ontdekt (placeholders hieronder):

```ts
export const config = {
  chills: [
    { id: "climate.zolder_chill",     name: "Zolder" },
    { id: "climate.speelkamer_chill", name: "Speelkamer" },
  ],
  thermostat: { id: "climate.thermostaat", name: "Thermostaat" },
  hueScenes: [
    { id: "scene.woonkamer_pumpkin_spice", name: "Pumpkin Spice" },
    { id: "scene.woonkamer_ontspannen",    name: "Ontspannen" },
    { id: "scene.woonkamer_aan_tafel",     name: "Aan Tafel!" },
    { id: "scene.woonkamer_gedimd",        name: "Gedimd" },
    { id: "scene.woonkamer_lezen",         name: "Lezen" },
    { id: "scene.woonkamer_lentebloesem",  name: "Lentebloesem" },
    { id: "scene.woonkamer_helder",        name: "Helder" },
    { id: "scene.woonkamer_uit",           name: "Uit" },
  ],
} as const;
```

Per Chill/thermostaat declareert de config (impliciet via type) welke acties zijn
toegestaan: Chill → `on_off | set_mode | set_fan | set_temp`; thermostaat → `set_temp`.

## 7. API-contract

### `GET /api/state`
Curated snapshot, voorbeeld:
```json
{
  "chills": [
    { "id": "climate.zolder_chill", "name": "Zolder", "available": true,
      "on": true, "mode": "cool", "temp": 18, "current": 24.4,
      "fan": "Hoog", "min": 16, "max": 30, "step": 1,
      "fanOptions": ["Laag", "Normaal", "Hoog"] }
  ],
  "thermostat": { "id": "climate.thermostaat", "name": "Thermostaat",
                  "temp": 20, "current": 19.6, "min": 5, "max": 30, "step": 0.5,
                  "available": true },
  "scenes": [ { "id": "scene.woonkamer_ontspannen", "name": "Ontspannen" } ]
}
```
`min/max/step/fanOptions` worden uit de entity-attributen gelezen, niet hardcoded.

### `POST /api/climate`
Body: `{ id: string, action: "on_off"|"set_mode"|"set_fan"|"set_temp", value }`

Validatie (= de grens):
- `id` moet in de whitelist staan (chills of thermostat).
- `action` moet toegestaan zijn voor dat apparaat.
- `set_temp.value` moet binnen `[min, max]` van de entity vallen.
- `set_mode.value ∈ {cool, heat, off}`; `set_fan.value ∈ fanOptions`.

Mapping naar HA-services:
| Actie | HA-service |
|---|---|
| `on_off` → uit | `climate.set_hvac_mode` (off) |
| `on_off` → aan | `climate.set_hvac_mode` (laatste/`cool`) |
| `set_mode` | `climate.set_hvac_mode` (cool/heat) |
| `set_temp` | `climate.set_temperature` |
| `set_fan` | `climate.set_fan_mode` |

### `POST /api/scene`
Body: `{ id: string }` — `id` moet in `hueScenes` staan → HA `scene.turn_on`.

Alle endpoints geven nette statuscodes: `200` ok, `400` validatie/whitelist,
`502` HA/Quatt-fout, `503` configuratie/token-fout.

## 8. Schermindeling & UX

Eén scherm, drie blokken (mobile-first, verticaal):

**A. Verlichting (woonkamer)** — grid van 8 Hue-scene-knoppen:
Pumpkin Spice · Ontspannen · Aan Tafel! · Gedimd · Lezen · Lentebloesem · Helder · Uit.
Tik = activeer scene. Geen per-lamp controls.

**B. Thermostaat** — kaart met huidige temp + setpoint −/+.

**C. Chills (Zolder + Speelkamer)** — per unit een kaart die de Quatt-UI spiegelt:
```
        Zolder
      ❄ 24,4°C        ← huidige kamertemp (read-only)
   ─   [ 18°C ]   +    ← setpoint, −/+ (stap/grenzen uit entity)
  ┌───────────┬───────────┐   ┌─────┐
  │  ❄ Koelen │ ♨ Verwarm │   │  ⏻  │  ← mode-toggle + aan/uit
  └───────────┴───────────┘   └─────┘
  ┌──────┬───────┬──────┐
  │ Laag │Normaal│ Hoog │       ← ventilator (1/2/3 bladen)
  └──────┴───────┴──────┘
```

## 9. Datastroom

**Status-lus:** PWA haalt elke ~3s `GET /api/state` op; de proxy filtert op de
whitelist en mapt naar de compacte vorm. HA blijft de bron van waarheid.

**Actie (optimistisch):** UI past direct aan → `POST` naar de proxy → validatie →
HA-service. De volgende poll (≤3s) bevestigt; bij mismatch corrigeert de UI. Bij
fout: toast + optimistische waarde draait terug.

**−/+ debounce:** ~400ms, stuurt alleen de eindwaarde (geen spam naar HA/Quatt).

## 10. Foutafhandeling

> Let op: app-toegang is lokaal, maar een **Chill-commando reist HA → Quatt-cloud →
> Chill**. Hue-scenes en (waarschijnlijk) de thermostaat zijn lokaal. Elk blok faalt
> onafhankelijk; één kapot apparaat legt de app niet plat.

| Situatie | Gedrag |
|---|---|
| HA onbereikbaar (poll faalt) | Banner "Verbinding met huis kwijt", laatste standen grijs, knoppen uit; herstelt bij volgende poll. |
| Chill/Quatt-cloud reageert niet | Toast "Chill reageert niet" + optimistische waarde terug. Licht/thermostaat blijven werken. |
| Ongeldige/geblokkeerde actie | Proxy weigert (400). Vangt sabotage van wifi-gebruikers af. |
| Optimistische mismatch | Poll is leidend → UI klapt terug naar echte stand. |
| HA-token ongeldig (401) | Proxy → 503 "configuratiefout" (eigenaar-gericht). |
| Telefoon offline | Service worker toont app-shell met "geen verbinding"-staat. |
| Snel −/+ tikken | Debounce ~400ms → alleen eindwaarde. |

## 11. Beveiliging

- HA-token staat **alleen server-side** (env), nooit in de client.
- De proxy is een **allowlist**: alleen de in `config/devices.ts` gedefinieerde
  entities + acties zijn bereikbaar; alles wordt server-side gevalideerd.
- Lokaal-only: geen internet-blootstelling in v1.
- Geen bezoekers-login (bewust); de allowlist is de werkelijke grens.

## 12. Deployment

- **Docker-container** op de machine waar HA draait.
  - HA OS / supervised → optioneel later als lokale HA-add-on verpakken.
  - HA Container/Core op Linux/NAS → `docker compose`.
- **Env-vars:** `HA_URL` (bijv. `http://homeassistant.local:8123`), `HA_TOKEN`
  (long-lived). Geen secrets in de repo.
- **Lokale HTTPS** voor de PWA (service worker + iOS vereisen secure context):
  via reverse proxy (Caddy/Nginx) met een lokaal certificaat of een `.local`-naam.
- QR wijst naar de lokale HTTPS-URL.

## 13. Teststrategie

1. **Validatie/whitelist (backend, TDD-first):** `/api/climate` weigert
   niet-whitelisted entity, temp buiten range, onbekende actie/fan en accepteert
   geldige; `/api/scene` weigert scenes buiten de 8.
2. **HA-client (gemockt):** correcte service-payloads; `getStates`-mapping.
3. **State-mapping:** nep-`/states` → verwachte compacte vorm (min/max/fan uit attributen).
4. **Frontend-componenten (Vitest + RTL):** optimistische update + terugdraaien;
   debounce; "verbinding kwijt"- en offline-staat.
5. **E2E-smoke (optioneel, Playwright):** scene/fan/−/+ tegen gemockte backend.
6. **Hand-acceptatie tegen echte HA:** entity-id's ontdekken; bevestigen dat Chill
   koelen/verwarmen/fan/temp het apparaat écht verstellen, Hue-scenes vuren,
   thermostaat-setpoint beweegt.

Tooling: Vitest + React Testing Library + MSW (HA mocken), optioneel Playwright.

## 14. Aannames & open punten (voor de bouw)

- **Quatt Remote API moet aan staan** in de HA-integratie (eenmalige CiC-pairing),
  anders zijn de Chill climate-entities niet bestuurbaar.
- **Entity-id's** (Chill Zolder/Speelkamer, thermostaat, 8 Hue-scenes) worden uit de
  draaiende HA ontdekt; placeholders in §6 worden vervangen.
- **HA-installatietype** (HA OS vs Docker/Core) bepaalt de exacte deployment-vorm.
- **Thermostaat** wordt voorlopig alleen op temperatuur bediend (geen modus/aan-uit);
  uit te breiden indien gewenst.
- **Chill temp-grenzen/stap** komen uit de entity-attributen (onderzoek noemde
  integer-bereik tot 5–40°C; UI volgt `min/max/step` van HA).

## 15. Bronnen (onderzoek)

- Quatt Chill — officiële handleiding & support: hoe bedien ik Chill?
- Home Assistant-integratie (Chill-besturing via cloud): `github.com/marcoboers/home-assistant-quatt`
- Lokale CIC-feed (read-only telemetrie): `http://<cic-ip>:8080/beta/feed/data.json`
- Quatt cloud mobile-API (reverse-engineered, write): `mobile-api.quatt.io`
- Bevinding: geen officiële Quatt-API, geen Matter/HomeKit; IR-besturing niet mogelijk.
