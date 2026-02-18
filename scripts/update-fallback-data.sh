#!/usr/bin/env bash
# Refresh static fallback data snapshots from the live API routes.
# Run periodically (e.g. weekly via CI) or manually before deploys.
# Usage: ./scripts/update-fallback-data.sh [base_url]

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
DIR="$(cd "$(dirname "$0")/../public/fallback" && pwd)"

echo "Updating fallback data from ${BASE_URL} → ${DIR}"

fetch() {
  local endpoint="$1" file="$2"
  echo -n "  ${endpoint} → ${file} ... "
  if curl -sf --max-time 30 "${BASE_URL}${endpoint}" -o "${DIR}/${file}"; then
    echo "OK ($(wc -c < "${DIR}/${file}" | tr -d ' ') bytes)"
  else
    echo "FAILED (keeping existing)"
  fi
}

fetch "/api/stations"      "stops.json"
fetch "/api/routes"        "routes.json"
fetch "/api/route-shapes"  "route-shapes.json"
fetch "/api/bike-parks"    "bike-parks.json"
fetch "/api/bike-lanes"    "bike-lanes.json"

echo "Done."
