#!/bin/sh
# Record the deploy commit SHA for GET /api/public/release.
#
# Usage (pick one):
#   ./scripts/record-release.sh                    # git on server (Option A)
#   ./scripts/record-release.sh bd96f67abc...      # pass SHA explicitly (Option B)
#   RELEASE_ID=bd96f67abc... ./scripts/record-release.sh
#
# Run before pm2 restart on Hostinger when .git is not on the server.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.release"

SHA="${1:-${RELEASE_ID:-}}"

if [ -n "$SHA" ]; then
  printf '%s\n' "$SHA" > "$OUT"
elif command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$ROOT" rev-parse HEAD > "$OUT"
elif [ -d "$ROOT/../.git" ] && command -v git >/dev/null 2>&1; then
  git -C "$ROOT/.." rev-parse HEAD > "$OUT"
else
  echo "record-release: no SHA argument, RELEASE_ID, or git repo found" >&2
  exit 1
fi

echo "Recorded release $(cat "$OUT")"
