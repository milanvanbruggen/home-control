# Huisbediening — Home Assistant add-on

Bezoekers-bediening voor je woonkamer-verlichting (Philips Hue scenes), de
Quatt Chills (Zolder + Speelkamer) en thermostaat-info. Draait op je HA-box,
start automatisch met Home Assistant, en is bereikbaar op het lokale netwerk
zonder dat bezoekers iets hoeven te installeren of in te loggen.

## Installeren

1. Home Assistant → **Instellingen → Add-ons → Add-on store**.
2. Rechtsboven **⋮ → Repositories** → plak
   `https://github.com/milanvanbruggen/home-control` → **Toevoegen**.
3. De add-on **"Huisbediening"** verschijnt onderaan → openen → **Installeren**
   (HA bouwt de app op de box; de eerste keer duurt dit enkele minuten).
4. **Starten**. Optioneel "Start bij booten" + "Watchdog" aanzetten.
5. Open op je telefoon (zelfde wifi): `http://<ha-ip>:3009`
   (bijv. `http://homeassistant.local:3009`).

Geen token nodig: de add-on praat intern met Home Assistant via de Supervisor.

## Updaten

Nieuwe versie? Verhoog `version` in `config.yaml` (en push naar de repo); HA
toont dan een update-knop die de add-on opnieuw bouwt vanaf de laatste code.

## Eisen

- De Quatt-integratie met **Remote API** ingeschakeld (anders zijn de Chill
  `climate`-entities er niet).
- De entity-id's in `config/devices.ts` moeten bij jouw HA passen
  (standaard: `climate.zolder`, `climate.speelkamer`, de 8 woonkamer-Hue-scenes,
  en `light.woonkamer` voor de "Uit"-knop).
