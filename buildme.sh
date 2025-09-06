#!/bin/bash
set -e

echo "Building service"
echo "==============="
bash "$(dirname "$0")/service/buildme.sh"

echo "Building Setup"
echo "============="
bash "$(dirname "$0")/setup/rcedit/rcedit.sh"
bash "$(dirname "$0")/setup/mkasar.sh"

echo "COMPILE SETUP"
echo "-------------"
# No direct Inno Setup equivalent on Linux. You may need to replace this line:
# "/C/Program Files (x86)/Inno Setup 5/iscc.exe" "$(dirname "$0")/setup/AchievementWatcher.iss"
echo "Inno Setup (iscc.exe) not available on Linux. Consider using a cross-platform alternative."
