#!/bin/sh
# Record the deploy commit SHA for GET /api/public/release.
#
# Hostinger (recommended — no GitHub SSH needed):
#   In hPanel → Node.js app → Deploy / Build command, append:
#     ./scripts/record-release.sh && pm2 restart backend
#   Uses git HEAD after Hostinger pulls your branch.
#
# Manual:
#   ./scripts/record-release.sh
#   ./scripts/record-release.sh <full-git-sha>
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
