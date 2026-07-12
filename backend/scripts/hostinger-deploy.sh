#!/bin/sh
# Example Hostinger staging deploy — run ON THE SERVER or from CI over SSH.
#
# From your laptop (CI / manual), pass the merge commit SHA:
#   ssh user@host 'cd /path/to/backend && ./scripts/hostinger-deploy.sh bd96f67...'
#
# Or on server after git pull (if .git exists):
#   ./scripts/hostinger-deploy.sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMMIT_SHA="${1:-}"

if [ -n "$COMMIT_SHA" ]; then
  echo "Deploying release $COMMIT_SHA"
else
  echo "Deploying (git HEAD)"
fi

npm install --production
./scripts/record-release.sh $COMMIT_SHA
# Rolling reload keeps other cluster workers up during restart (multi-node safe)
pm2 reload backend || pm2 restart backend || pm2 restart all

echo "Release endpoint should now return:"
cat "$ROOT/.release"
