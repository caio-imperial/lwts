#!/usr/bin/env bash
# Fail when a tracked source file exceeds the line limit.
# Files listed in scripts/file-size-allowlist.txt are grandfathered; the list
# must only shrink (ratchet).
set -euo pipefail

LIMIT="${FILE_SIZE_LIMIT:-500}"
ALLOWLIST="scripts/file-size-allowlist.txt"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0
while IFS= read -r file; do
  case "$file" in
    *.go|*.js|*.mjs|*.cjs|*.css|*.html) ;;
    *) continue ;;
  esac
  [ -f "$file" ] || continue

  lines=$(wc -l < "$file")
  if [ "$lines" -gt "$LIMIT" ]; then
    if [ -f "$ALLOWLIST" ] && grep -qxF "$file" "$ALLOWLIST"; then
      continue
    fi
    echo "file too large: $file ($lines > $LIMIT)" >&2
    fail=1
  fi
done < <(git ls-files)

# Ratchet: warn when an allowlisted file no longer needs the exception.
if [ -f "$ALLOWLIST" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    case "$file" in
      \#*) continue ;;
    esac
    [ -f "$file" ] || continue
    lines=$(wc -l < "$file")
    if [ "$lines" -le "$LIMIT" ]; then
      echo "allowlist entry can be removed: $file ($lines <= $LIMIT)" >&2
    fi
  done < "$ALLOWLIST"
fi

exit $fail
