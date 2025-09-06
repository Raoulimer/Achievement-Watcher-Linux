#!/bin/bash

# Get the directory of the current script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR/watchdog"
npm prune --production

cd "$SCRIPT_DIR/updater"
npm prune --production
