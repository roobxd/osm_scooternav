import { respondJSON, json, requireAuth } from './_utils.js';

// Admin-only endpoint to reset baseline dataset to current OSM roads for Netherlands
// POST /admin/reset-baseline { mode?: 'force' }
// Requires X-Admin-Token header equal to env.ADMIN_TOKEN OR a logged-in admin user
export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Use POST to reset baseline dataset' }, 405);

  const token = request.headers.get('X-Admin-Token');
  if (!(env.ADMIN_TOKEN && token === env.ADMIN_TOKEN)) {
    const auth = await requireAuth(request, env);
    if (!auth || !auth.user?.isAdmin) return respondJSON({ error: 'Admin privileges required', hint: 'Provide X-Admin-Token or log in as an admin.' }, 403);
  }

  const body = await json(request) || {};

  // Fetch current OSM data from Overpass API: all ways with highway tag within NL
  // We limit to ways and include their nodes for geometry
  // Use bounding box for the Netherlands to avoid area lookup flakiness
  // BBOX: south,west,north,east = 50.7,3.2,53.7,7.2
  // Keep the initial baseline lightweight so the editor can load quickly.
  // Include only the largest road classes: motorway, trunk, primary.
  // We can expand later to secondary/tertiary with viewport-based loading.
  const overpassQuery = `\n[out:json][timeout:180][bbox:50.7,3.2,53.7,7.2];\n(\n  way["highway"~"^(motorway|trunk|primary)$"];\n);\n(._;>;);\nout body;\n`;

  let overpassJSON;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
  ];

  async function queryOverpass(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: overpassQuery }).toString(),
        signal: controller.signal
      });
      if (!resp.ok) throw new Error(`Overpass error ${resp.status} at ${url}`);
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    overpassJSON = await Promise.any(endpoints.map((u) => queryOverpass(u)));
  } catch (aggregateErr) {
    const details = (aggregateErr && aggregateErr.errors) ? aggregateErr.errors.map(e => String(e.message || e)) : ['All Overpass mirrors failed'];
    return respondJSON({ error: 'Failed to fetch baseline from Overpass mirrors', details, hint: 'Try again later; mirrors may be down.' }, 502);
  }

  // Convert Overpass JSON to GeoJSON FeatureCollection (LineString for ways)
  // Preserve OSM IDs as Feature.id = 'w' + way.id
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
    if (coords.length < 2) continue; // skip degenerate
    const props = { ...(way.tags || {}), _osm_type: 'way', _osm_id: way.id };
    features.push({
      type: 'Feature',
      id: 'w' + way.id,
      properties: props,
      geometry: { type: 'LineString', coordinates: coords }
    });
  }

  const collection = { type: 'FeatureCollection', features };

  // Store to R2 as nl.geojson
  try {
    await env.MAPDATA.put('nl.geojson', JSON.stringify(collection), {
      httpMetadata: { contentType: 'application/json' }
    });
  } catch (e) {
    return respondJSON({ error: `Failed to store dataset: ${e.message || e}` }, 500);
  }
  // Clear change logs
  try {
    const list = await env.CHANGES.list({ prefix: 'changes:' });
    for (const key of list.keys || []) {
      await env.CHANGES.delete(key.name);
    }
  } catch {}

  // Reset user change counters
  try {
    const users = await env.USERS.list({ prefix: 'users:' });
    for (const key of users.keys || []) {
      const uStr = await env.USERS.get(key.name);
      if (!uStr) continue;
      try {
        const u = JSON.parse(uStr);
        u.changeCount = 0;
        await env.USERS.put(key.name, JSON.stringify(u));
      } catch {}
    }
  } catch {}

  return respondJSON({ ok: true, featureCount: features.length, changesCleared: true });
}
