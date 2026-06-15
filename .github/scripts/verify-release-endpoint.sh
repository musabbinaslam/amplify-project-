#!/usr/bin/env bash
# Usage: verify-release-endpoint.sh <API_URL> <RELEASE_ID>
set -euo pipefail

API_URL="${1:?API_URL required}"
RELEASE_ID="${2:?RELEASE_ID required}"

for i in $(seq 1 30); do
  if [ "$i" -gt 1 ]; then sleep 10; fi

  BODY=$(curl -sS --max-time 20 \
    -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    "$API_URL/api/public/release?t=$(date +%s)" 2>/dev/null || echo '')

  if [ -z "$BODY" ]; then
    echo "Attempt $i: empty response — retrying"
    continue
  fi

  if echo "$BODY" | grep -qi 'checking your browser'; then
    echo "Attempt $i: CDN bot check — retrying (disable in Hostinger hPanel if this persists)"
    continue
  fi

  if ! echo "$BODY" | grep -q 'releaseId'; then
    echo "Attempt $i: unexpected response — retrying"
    continue
  fi

  echo "Attempt $i: $BODY"
  if echo "$BODY" | grep -qE "\"releaseId\"[[:space:]]*:[[:space:]]*\"$RELEASE_ID\""; then
    echo "✓ Backend API reports $RELEASE_ID"
    exit 0
  fi
done

echo "::error::API did not report $RELEASE_ID after ~5 min (CDN may block GitHub — check Hostinger deploy logs for [release] Wrote .release)"
exit 1
