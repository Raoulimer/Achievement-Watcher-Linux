#!/bin/bash
set -e

# Define variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="{{app}}" # Replace with your actual app directory name
TEMP_DIR="$SCRIPT_DIR/../temp"
APP_DIR="$SCRIPT_DIR/../app"
RESOURCE_DIR="$SCRIPT_DIR/${APP_NAME}/resources"
ASAR_IGNORE="$SCRIPT_DIR/asar.ignore"

# 1. Clean up old resources and temp
rm -rf "$RESOURCE_DIR"
mkdir -p "$RESOURCE_DIR"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# 2. Copy app files excluding those in asar.ignore
rsync -av --exclude-from="$ASAR_IGNORE" "$APP_DIR/" "$TEMP_DIR/"

# 3. Clean for production
echo "CLEANING FOR PRODUCTION"
cd "$TEMP_DIR"

json -I -f package.json -e "this.name='Achievement-Watcher'"
npm prune --production
json -I -f package.json -e "this.name='Achievement Watcher'"

echo "PACKING TO ASAR"
json -I -f package.json -e "this.config.debug=false"

# 4. Pack asar
cd "$SCRIPT_DIR/${APP_NAME}"
asar pack ../../temp/ resources/app.asar --unpack "{*.node,*.dll}"

# 5. Clean temp
echo "CLEANING TEMP"
rm -rf "$TEMP_DIR"

