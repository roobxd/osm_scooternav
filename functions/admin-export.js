import { respondJSON, requireAuth } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Method Not Allowed' }, 405);

  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Unauthorized' }, 401);
  if (!auth.user || !auth.user.isAdmin) return respondJSON({ error: 'Forbidden' }, 403);

  const obj = await env.MAPDATA.get('nl.geojson');
  if (!obj) return respondJSON({ error: 'Not Found' }, 404);

  // Parse baseline
  let baseline;
  try {
    baseline = await new Response(obj.body).json();
  } catch (e) {
    return respondJSON({ error: 'Baseline parse error' }, 500);
  }
  const byId = new Map();
  if (baseline && Array.isArray(baseline.features)) {
    for (const f of baseline.features) {
      if (!f || !f.id) continue;
      byId.set(f.id, f);
    }
  } else {
    baseline = { type: 'FeatureCollection', features: [] };
  }

  // Collect all changes and apply oldest->newest so later edits win
  let list;
  try {
    list = await env.CHANGES.list({ prefix: 'changes:' });
  } catch {
    list = { keys: [] };
  }
  const entries = [];
  for (const k of (list.keys || [])) {
    const val = await env.CHANGES.get(k.name);
    if (!val) continue;
    try { entries.push(JSON.parse(val)); } catch {}
  }
  entries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  for (const entry of entries) {
    const fc = entry && entry.data;
    const feats = fc && Array.isArray(fc.features) ? fc.features : [];
    for (const f of feats) {
      if (!f || !f.id) continue;
      const props = f.properties || {};
      const deleted = (props.deleted === true) || (props._deleted === true) || (props._action === 'delete') || (f.deleted === true);
      if (deleted) byId.delete(f.id);
      else byId.set(f.id, f);
    }
  }

  const merged = { type: 'FeatureCollection', features: Array.from(byId.values()) };
  const jsonText = JSON.stringify(merged);
  return new Response(jsonText, {
    status: 200,
    headers: {
      'Content-Type': 'application/geo+json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="nl.geojson"'
    }
  });
}