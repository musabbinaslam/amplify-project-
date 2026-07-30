#!/bin/sh
# Update backend on the VPS from staging or main.
#
# Interactive (menu):
#   cd /path/to/backend && ./scripts/update-backend.sh
#
# Non-interactive:
#   ./scripts/update-backend.sh staging
#   ./scripts/update-backend.sh main
#
# Skip confirmation prompt:
#   ./scripts/update-backend.sh staging --yes
#   ./scripts/update-backend.sh --yes main
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AUTO_YES=0
BRANCH=""

for arg in "$@"; do
  case "$arg" in
    --yes|-y)
      AUTO_YES=1
      ;;
    staging|main)
      BRANCH="$arg"
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [staging|main] [--yes]" >&2
      exit 1
      ;;
  esac
done

git_current_branch() {
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git symbolic-ref -q --short HEAD 2>/dev/null || git rev-parse --short HEAD
  else
    echo "(not a git repo)"
  fi
}

git_current_sha() {
  if command -v git >/dev/null 2>&1 && git rev-parse HEAD >/dev/null 2>&1; then
    git rev-parse --short HEAD
  else
    echo "(unknown)"
  fi
}

pick_branch() {
  echo "Update backend from which branch?"
  echo "  1) staging"
  echo "  2) main (production)"
  echo "  q) quit"
  printf "Choice: "
  read -r choice
  case "$choice" in
    1|staging)
      BRANCH="staging"
      ;;
    2|main)
      BRANCH="main"
      ;;
    q|Q)
      echo "Aborted."
      exit 0
      ;;
    *)
      echo "Invalid choice." >&2
      exit 1
      ;;
  esac
}

if [ -z "$BRANCH" ]; then
  pick_branch
fi

if [ "$BRANCH" != "staging" ] && [ "$BRANCH" != "main" ]; then
  echo "Only staging and main are allowed." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not installed." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository: $ROOT" >&2
  exit 1
fi

CURRENT_BRANCH="$(git_current_branch)"
CURRENT_SHA="$(git_current_sha)"

echo ""
echo "Backend root: $ROOT"
echo "Current branch: $CURRENT_BRANCH"
echo "Current HEAD:   $CURRENT_SHA"
echo "Target branch:  $BRANCH"
echo ""

if [ "$AUTO_YES" -eq 0 ]; then
  printf "Continue with fetch, checkout, and deploy? [y/N] "
  read -r confirm
  case "$confirm" in
    y|Y|yes|YES)
      ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

echo "Fetching origin..."
git fetch origin

echo "Checking out $BRANCH..."
git checkout "$BRANCH"

echo "Pulling latest from origin/$BRANCH (fast-forward only)..."
git pull --ff-only origin "$BRANCH"

NEW_SHA="$(git rev-parse --short HEAD)"
echo "Now at $BRANCH @ $NEW_SHA"
echo ""

./scripts/hostinger-deploy.sh

echo ""
echo "Deploy complete."
echo "Verify on this host:"
echo "  curl -sS https://<your-api-host>/health"
echo "  curl -sS https://<your-api-host>/api/public/release"
echo "Recorded release: $(cat "$ROOT/.release")"
