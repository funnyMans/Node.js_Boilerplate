#!/usr/bin/env bash
# Render Mermaid diagrams to SVG using mermaid-cli (mmdc via npx)
# Usage: ./scripts/render-diagrams.sh

set -euo pipefail

SRC_DIR="docs/diagrams-src"
OUT_DIR="docs/images"

mkdir -p "$OUT_DIR"

for file in "$SRC_DIR"/*.mmd; do
  base=$(basename "$file" .mmd)
  out="$OUT_DIR/${base}.svg"
  echo "Rendering $file -> $out"
  # Use npx to run mermaid-cli without global install
  npx @mermaid-js/mermaid-cli -i "$file" -o "$out" || {
    echo "Rendering failed for $file. Ensure you have Node and npx installed, and an internet connection to fetch the mermaid-cli package if not cached." >&2
  }
done

echo "Done. SVGs are in $OUT_DIR"
