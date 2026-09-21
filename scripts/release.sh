#!/usr/bin/env bash
#
# release.sh — cut a new version and push the tag that triggers the release CI.
#
# Bumps package.json, commits, creates an annotated `vX.Y.Z` tag, and pushes.
# The push of the tag fires .github/workflows/release.yml, which builds the
# arm64 + x64 DMGs and publishes the GitHub Release with both attached.
#
# Usage:
#   scripts/release.sh patch                # 2.0.0 -> 2.0.1
#   scripts/release.sh minor                # 2.0.0 -> 2.1.0
#   scripts/release.sh major                # 2.0.0 -> 3.0.0
#   scripts/release.sh 2.4.1                 # set an explicit version
#   scripts/release.sh patch --yes           # skip the confirmation prompt
#   scripts/release.sh patch --dry-run       # show what would happen, change nothing
#
set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-}"
YES=false
DRY=false
for arg in "${@:2}"; do
  case "$arg" in
    --yes|-y)     YES=true ;;
    --dry-run|-n) DRY=true ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

usage() { echo "Usage: scripts/release.sh <major|minor|patch|X.Y.Z> [--yes] [--dry-run]" >&2; }

if [[ -z "$BUMP" ]]; then usage; exit 1; fi
if ! [[ "$BUMP" =~ ^(major|minor|patch)$ || "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid bump: '$BUMP'" >&2; usage; exit 1
fi

# Clean tree required — the tag must point at a committed state.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  exit 1
fi

CUR="$(node -p "require('./package.json').version")"

# Compute the next version.
if [[ "$BUMP" =~ ^[0-9] ]]; then
  NEXT="$BUMP"
else
  NEXT="$(node -e "
    const [a,b,c] = require('./package.json').version.split('.').map(Number);
    const k='$BUMP';
    console.log(k==='major' ? [a+1,0,0].join('.') : k==='minor' ? [a,b+1,0].join('.') : [a,b,c+1].join('.'));
  ")"
fi

TAG="v$NEXT"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag $TAG already exists." >&2
  exit 1
fi

echo "  current : v$CUR"
echo "  next    : $TAG"
echo "  branch  : $BRANCH"
echo "  action  : bump package.json, commit, tag $TAG, push (CI builds + releases)"

if $DRY; then
  echo "(dry run — nothing changed)"
  exit 0
fi

if ! $YES; then
  read -r -p "Proceed? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# npm version writes package.json + package-lock, commits, and creates the tag.
npm version "$NEXT" -m "Release v%s"

git push origin "$BRANCH" --follow-tags

echo
echo "Pushed $TAG. Watch the build:"
echo "  https://github.com/cripkd/claude-learning-coach/actions"
