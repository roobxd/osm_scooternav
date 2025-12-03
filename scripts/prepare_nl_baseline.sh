#!/usr/bin/env bash
set -euo pipefail

# Prepare a full Netherlands roads baseline (GeoJSON) and upload to R2.
# Requirements:
# - curl
# - osmium-tool (install via: brew install osmium-tool)
# - wrangler (npx -y wrangler@latest ...)
#
# Usage examples:
#   bash scripts/prepare_nl_baseline.sh local
#   bash scripts/prepare_nl_baseline.sh remote
#
# "local" uploads to the local R2 store used by `wrangler pages dev`.
# "remote" uploads to your Cloudflare R2 bucket (requires `wrangler login`).

MODE=${1:-local}
PERSIST_DIR=${2:-}
if [[ "$MODE" != "local" && "$MODE" != "remote" ]]; then
  echo "Usage: $0 [local|remote] [persist_dir_optional]" >&2
  exit 1
fi

command -v osmium >/dev/null 2>&1 || {
  echo "Error: osmium-tool not found. Install with: brew install osmium-tool" >&2
  exit 1
}

WORKDIR=$(mktemp -d "nlbaseline.XXXXXX")
echo "Working in $WORKDIR"
cd "$WORKDIR"

echo "Downloading Geofabrik Netherlands PBF..."
curl -L -o netherlands-latest.osm.pbf \
  https://download.geofabrik.de/europe/netherlands-latest.osm.pbf

echo "Filtering to highway ways (all classes)..."
# Keep all features with a 'highway' tag
osmium tags-filter netherlands-latest.osm.pbf w/highway -o nl-highways.osm.pbf

echo "Exporting to GeoJSON (this can take a while)..."
# Export as GeoJSON, limiting to ways geometry for roads
osmium export nl-highways.osm.pbf -o nl.geojson \
  --overwrite \
  --geometry-types=linestring

echo "GeoJSON ready: $WORKDIR/nl.geojson"

echo "Uploading to R2..."
if [[ "$MODE" == "local" ]]; then
  if [[ -n "$PERSIST_DIR" ]]; then
    npx -y wrangler@latest r2 object put mapdata/nl.geojson \
      --file ./nl.geojson \
      --local \
      --persist-to "$PERSIST_DIR"
  else
    npx -y wrangler@latest r2 object put mapdata/nl.geojson \
      --file ./nl.geojson \
      --local
  fi
else
  npx -y wrangler@latest login
  npx -y wrangler@latest r2 object put --bucket mapdata nl.geojson \
    --file ./nl.geojson \
    --remote
fi

echo "Done. nl.geojson uploaded to R2 ($MODE)."
echo "Verify locally: curl -I http://localhost:8791/api/map"
echo "Verify remote:  curl -I https://<your-domain>/api/map"