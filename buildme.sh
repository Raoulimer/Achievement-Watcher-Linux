#!/bin/bash

echo "Building service"
echo "================"
bash "$(dirname "$0")/service/buildme.sh"
echo "Building Setup"
echo "=============="
#bash "$(dirname "$0")/setup/rcedit/rcedit.sh"
bash "$(dirname "$0")/setup/mkasar.sh"
echo "COMPILE SETUP"
echo "-------------"
# Insert your Linux packaging command here (e.g., makeself, dpkg, etc.)
# Example: dpkg-deb --build setup/AchievementWatcher
