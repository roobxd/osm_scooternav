import { respondJSON, requireAuth } from './_utils.js';

// GET /api/import-bbox?bbox=south,west,north,east&classes=residential,service,secondary,tertiary
// Requires a logged-in user. Fetches roads in the bbox from Overpass and returns GeoJSON.
export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Method Not Allowed' }, 405);
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const bboxStr = url.searchParams.get('bbox');
  const classesStr = url.searchParams.get('classes') || 'residential,service,secondary,tertiary';
  if (!bboxStr) return respondJSON({ error: 'Missing bbox' }, 400);

  const parts = bboxStr.split(',').map(s => +s.trim());
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) {
    return respondJSON({ error: 'Invalid bbox' }, 400);
  }
  const [south, west, north, east] = parts;
  const allowed = new Set(['motorway','trunk','primary','secondary','tertiary','residential','service','unclassified']);
  const requested = classesStr.split(',').map(s => s.trim()).filter(Boolean).filter(c => allowed.has(c));
  const classRegex = requested.length ? `^(${requested.join('|')})$` : '^(residential|service|secondary|tertiary)$';

  // Build Overpass query for bbox and requested classes
  const overpassQuery = `\n[out:json][timeout:120][bbox:${south},${west},${north},${east}];\n(\n  way["highway"~"${classRegex}"];\n);\n(._;>;);\nout body;\n`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
  ];
  let overpassJSON = null;
  let lastErr = null;
  for (const ep of endpoints) {
    try {
      const resp = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: overpassQuery }).toString()
      });
      if (!resp.ok) { lastErr = `Overpass error ${resp.status} at ${ep}`; continue; }
      overpassJSON = await resp.json();
      break;
    } catch (e) {
      lastErr = `Failed to fetch Overpass at ${ep}: ${e.message || e}`;
    }
  }
  if (!overpassJSON) return respondJSON({ error: lastErr || 'Overpass failed' }, 502);

  // Convert Overpass result to GeoJSON
  const nodes = new Map();
  const ways = [];
  for (const el of (overpassJSON.elements || [])) {
    if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat]);
    else if (el.type === 'way') ways.push(el);
  }
  const features = [];
  for (const way of ways) {
    const coords = [];
    if (Array.isArray(way.nodes)) {
      for (const nid of way.nodes) {
        const p = nodes.get(nid);
        if (p) coords.push(p);
      }
    }
    if (coords.length < 2) continue;
    const props = { ...(way.tags || {}), _osm_type: 'way', _osm_id: way.id };
    features.push({ type: 'Feature', id: 'w' + way.id, properties: props, geometry: { type: 'LineString', coordinates: coords } });
  }

  const collection = { type: 'FeatureCollection', features };
  return respondJSON({ ok: true, bbox: [south, west, north, east], classes: requested, featureCount: features.length, data: collection });
}