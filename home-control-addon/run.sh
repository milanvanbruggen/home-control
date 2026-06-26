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

# Persist app state in the shared /share folder instead of the add-on's private
# /data volume, which HA deletes on uninstall. /share survives uninstall/reinstall,
# so settings, sampled temperature/humidity history and push subscriptions are kept.
DATA_HOME=/share/home_control
mkdir -p "$DATA_HOME"
# One-time migration from the old /data location so this switch doesn't itself drop
# state that's already there. options.json is Supervisor-managed, not app state.
if ls /data/*.json >/dev/null 2>&1; then
  for f in /data/*.json; do
    base="$(basename "$f")"
    [ "$base" = options.json ] && continue
    [ -f "$DATA_HOME/$base" ] || cp -a "$f" "$DATA_HOME/$base" || true
  done
fi
export DATA_DIR="$DATA_HOME"
export SETTINGS_PATH="$DATA_HOME/settings.json"

exec npm start
