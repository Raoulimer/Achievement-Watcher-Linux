#!/bin/bash

echo "Building service"
echo "================"
bash "$(dirname "$0")/service/buildme.sh"

echo "Building Setup"
echo "=============="
bash "$(dirname "$0")/setup/mkasar.sh"

echo "Packaging App"
echo "============="
# Example: create a tarball (optional)
tar czvf AchievementWatcher-linux-x64.tar.gz ./app

echo "Build Complete!"
echo "You can now run the app from the app directory with 'npm start'."
