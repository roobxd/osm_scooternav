#!/usr/bin/env bash
set -euo pipefail

# Local export script: GeoJSON → OSM → PBF
# Requirements:
# - wrangler (configured to access your R2 bucket MAPDATA)
# - osmium-tool (installed locally)

echo "Downloading nl.geojson from R2 (MAPDATA)..."
wrangler r2 object get MAPDATA/nl.geojson --local --file nl.geojson

echo "Converting GeoJSON → OSM..."
osmium convert nl.geojson -o updated.osm

echo "Converting OSM → PBF..."
osmium osm2pbf updated.osm -o updated.pbf

echo "Export complete: updated.pbf"
echo "Reminder: Use graphhopper import updated.pbf"