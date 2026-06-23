# Huisbediening (Visitor Home Control)

Lokale PWA waarmee bezoekers verlichting (woonkamer Hue-scenes), de thermostaat en
de Quatt Chills (Zolder + Speelkamer) bedienen via Home Assistant. Geen app-installatie.

## Vereisten
- Home Assistant op het LAN, met de Quatt-integratie + **Remote API** ingeschakeld
  (eenmalig CiC-knop pairen) zodat de Chill-`climate`-entities bestuurbaar zijn.
- Een long-lived access token uit HA.

## Setup
1. `cp .env.example .env` en vul `HA_URL` + `HA_TOKEN` in.
2. Pas de echte entity-id's aan in `config/devices.ts` (zie "Entity-id's ontdekken").
3. `docker compose up -d --build`
4. Open `http://<host>:3000` (zet er een reverse proxy met HTTPS voor i.v.m. PWA/iOS).
5. Maak een QR-code naar de HTTPS-URL voor bezoekers.

## Entity-id's ontdekken
In HA → Developer Tools → States. Zoek de `climate.*`-entities van de twee Chills en
de thermostaat, en de `scene.*`-entities van de 8 woonkamer-scenes. Zet die ids in
`config/devices.ts`.

## Tests
`npm test`
