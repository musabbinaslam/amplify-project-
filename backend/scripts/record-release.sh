#!/bin/sh
# Write the current git commit SHA for release coordination with the Vercel frontend.
# Run from backend/ after `git pull` on Hostinger (before pm2 restart).
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
git -C "$ROOT" rev-parse HEAD > "$ROOT/.release"
echo "Recorded release $(cat "$ROOT/.release")"
