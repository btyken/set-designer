#!/bin/sh
# Builds the static site and publishes it to the gh-pages branch.
# Usage: SD_PASSCODE='team passcode' SD_TRACKER_URL='https://script.google.com/macros/s/.../exec' npm run deploy
set -e
cd "$(dirname "$0")/.."
if [ -z "$SD_PASSCODE" ] && [ -z "$SD_PASS_HASH" ]; then
  echo "Set SD_PASSCODE to the team passcode first." >&2
  exit 1
fi
REMOTE=$(git remote get-url origin)
node scripts/build-static.mjs
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -q -m "Publish static site"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Published to gh-pages."
