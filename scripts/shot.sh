#!/usr/bin/env bash
# Screenshot the running demo with headless Chrome.
#   ./scripts/shot.sh [canvas|dom] [out.png] [width] [height]
# Requires `npm run dev` to be running on PORT (default 5173).

set -euo pipefail

BACKEND="${1:-canvas}"
OUT="${2:-shot-$BACKEND.png}"
WIDTH="${3:-1280}"
HEIGHT="${4:-800}"
PORT="${PORT:-5173}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME (override with CHROME=...)" >&2
  exit 1
fi

"$CHROME" \
  --headless --disable-gpu --no-first-run --hide-scrollbars \
  --virtual-time-budget=3000 \
  --window-size="$WIDTH,$HEIGHT" \
  --screenshot="$OUT" \
  "http://localhost:$PORT/?backend=$BACKEND" 2>/dev/null

echo "wrote $OUT"
