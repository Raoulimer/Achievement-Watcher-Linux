#!/usr/bin/env bash
# Remove what install.sh added. Keeps your settings and caches in ~/.config/Achievement Watcher unless --purge.
set -euo pipefail

UNIT="achievement-watchdog.service"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

systemctl --user disable --now "$UNIT" 2>/dev/null || true
rm -f "$UNIT_DIR/$UNIT"
systemctl --user daemon-reload
rm -f "$APPS_DIR/achievement-watcher.desktop"

if [[ -f /etc/apparmor.d/achievement-watcher ]]; then
  echo "Removing the AppArmor profile (needs sudo)"
  sudo apparmor_parser -R /etc/apparmor.d/achievement-watcher 2>/dev/null || true
  sudo rm -f /etc/apparmor.d/achievement-watcher
fi

if [[ "${1:-}" == "--purge" ]]; then
  rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/Achievement Watcher" "${XDG_CONFIG_HOME:-$HOME/.config}/achievement-watcher"
  echo "Settings and caches removed"
fi
echo "Uninstalled"
