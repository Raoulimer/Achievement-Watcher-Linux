#!/bin/bash
# Equivalent of npm install.cmd for Linux

set -e

cd "$(dirname "$0")/app"
npm ci
npm run-script native-rebuild

cd "$(dirname "$0")/service/updater"
npm ci

cd "$(dirname "$0")/service/watchdog"
npm ci

cd "$(dirname "$0")/server/v2"
npm ci
