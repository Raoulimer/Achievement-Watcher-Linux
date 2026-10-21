#!/usr/bin/env bash
# Achievement Watcher for Linux - install / update from this checkout
#   - installs the npm dependencies (app + watchdog)
#   - adds "Achievement Watcher" to the app menu
#   - runs the watchdog as a systemd user service (starts with your desktop session)
#   - on Ubuntu >= 23.10, adds an AppArmor profile so Electron can keep its sandbox (asks for sudo once)
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
ELECTRON="$ROOT/app/node_modules/electron/dist/electron"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="achievement-watchdog.service"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

if [[ $EUID -eq 0 ]]; then
  die "run this as your normal user, without sudo (it asks for sudo itself, only for the AppArmor profile)"
fi
if find "$ROOT" -user root -print -quit 2>/dev/null | grep -q .; then
  die "root-owned files found (from an install run with sudo). Fix them first with:
  sudo chown -R \"$USER:$USER\" \"$ROOT\""
fi

step "Checking requirements"
command -v node >/dev/null || die "Node.js >= 22.12 is required to install (sudo apt install nodejs npm)"
command -v npm  >/dev/null || die "npm is required to install (sudo apt install npm)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit((a>22||(a===22&&b>=12))?0:1)' \
  || die "Node.js >= 22.12 is required (found $(node -v))"
command -v notify-send >/dev/null || warn "notify-send not found: no desktop notifications until you install libnotify-bin"
command -v pw-play >/dev/null || command -v paplay >/dev/null || command -v canberra-gtk-play >/dev/null \
  || warn "no audio player found (pw-play / paplay / canberra-gtk-play): achievements will be silent"

step "Installing dependencies"
(cd "$ROOT/app" && npm ci --no-audit --no-fund)
(cd "$ROOT/service/watchdog" && npm ci --no-audit --no-fund)
if [[ ! -x "$ELECTRON" ]]; then
  warn "Electron binary missing after npm ci, running its download step again"
  (cd "$ROOT/app/node_modules/electron" && node install.js)
fi
[[ -x "$ELECTRON" ]] || die "Electron binary not found: $ELECTRON"
chmod +x "$ROOT/bin/achievement-watcher"

# Ubuntu >= 23.10 blocks unprivileged user namespaces unless an AppArmor profile allows them,
# and Chromium refuses to start without its sandbox. Same approach Ubuntu uses for VS Code, Brave, Chrome.
if [[ "$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" == "1" ]]; then
  PROFILE="/etc/apparmor.d/achievement-watcher"
  WANTED="$(sed "s|@ELECTRON@|$ELECTRON|" "$ROOT/packaging/apparmor/achievement-watcher")"
  if [[ -f "$PROFILE" ]] && [[ "$(cat "$PROFILE")" == "$WANTED" ]]; then
    step "AppArmor profile already installed"
  else
    step "Installing AppArmor profile for Electron's sandbox (needs sudo)"
    echo "$WANTED" | sudo tee "$PROFILE" >/dev/null
    sudo apparmor_parser -r "$PROFILE"
  fi
fi

step "Adding the app menu entry"
mkdir -p "$APPS_DIR"
sed -e "s|@ROOT@|$ROOT|g" "$ROOT/packaging/achievement-watcher.desktop" > "$APPS_DIR/achievement-watcher.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS_DIR" || true

step "Installing the watchdog service"
mkdir -p "$UNIT_DIR"
sed -e "s|@ROOT@|$ROOT|g" -e "s|@ELECTRON@|$ELECTRON|g" "$ROOT/packaging/$UNIT" > "$UNIT_DIR/$UNIT"
systemctl --user daemon-reload
systemctl --user enable "$UNIT" >/dev/null
systemctl --user restart "$UNIT"
sleep 1
systemctl --user is-active --quiet "$UNIT" && echo "watchdog is running" || warn "watchdog did not start: journalctl --user -u $UNIT"

step "Done"
echo "Open \"Achievement Watcher\" from the app menu, or run: $ROOT/bin/achievement-watcher"
echo "Watchdog logs: journalctl --user -u $UNIT -f"
