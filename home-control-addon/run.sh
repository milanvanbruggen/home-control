#!/usr/bin/env sh
# HA writes the add-on options to /data/options.json. Pass the optional Hue
# Bridge credentials to the Next server as env vars so scene tiles can show the
# real Hue colors (the app falls back gracefully when they're blank).
set -e
OPTS=/data/options.json
if [ -f "$OPTS" ]; then
  export HUE_BRIDGE_IP="$(node -e "try{process.stdout.write(String(require('$OPTS').hue_bridge_ip||''))}catch(e){}")"
  export HUE_APP_KEY="$(node -e "try{process.stdout.write(String(require('$OPTS').hue_app_key||''))}catch(e){}")"
fi
exec npm start
