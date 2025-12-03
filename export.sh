#!/usr/bin/env bash
set -euo pipefail

# Local export script: GeoJSON → OSM → PBF
# Requirements:
# - wrangler (configured to access your R2 bucket MAPDATA)
# - osmium-tool (installed locally)
# - node (for geojsontoosm via npx)

PERSIST_DIR=${PERSIST_DIR:-}
echo "Downloading nl.geojson from R2 (MAPDATA)..."
if [[ -n "$PERSIST_DIR" ]]; then
  npx -y wrangler@latest r2 object get mapdata/nl.geojson --local --persist-to "$PERSIST_DIR" --file nl.geojson
else
  npx -y wrangler@latest r2 object get mapdata/nl.geojson --local --file nl.geojson
fi

echo "Converting GeoJSON → OSM (using geojsontoosm)..."
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192"
npx -y geojsontoosm nl.geojson > updated.osm

echo "Converting OSM → PBF (using osmium cat -f pbf)..."
osmium cat updated.osm -f pbf -o updated.pbf

echo "Export complete: updated.pbf"
echo "Reminder: Use graphhopper import updated.pbf"