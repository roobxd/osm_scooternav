// Shared helpers for Cloudflare Pages Functions (Web Request/Response API)

export const COOKIE_NAME = 'ssid';

function b64url(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function textToUint8(str) {
  return new TextEncoder().encode(str);
}

export async function hmacSign(secret, data) {
  const keyData = textToUint8(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, textToUint8(data));
  return b64url(sig);
}

export async function hashPassword(username, password, salt = '') {
  // Deterministic SHA-256 hash: salt + username + ':' + password
  const input = `${salt}${username}:${password}`;
  const digest = await crypto.subtle.digest('SHA-256', textToUint8(input));
  return b64url(digest);
}

export function makeCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.MaxAge !== undefined) parts.push(`Max-Age=${opts.MaxAge}`);
  if (opts.Path) parts.push(`Path=${opts.Path}`);
  if (opts.Domain) parts.push(`Domain=${opts.Domain}`);
  if (opts.Secure) parts.push('Secure');
  parts.push('HttpOnly');
  parts.push(`SameSite=${opts.SameSite || 'Lax'}`);
  return parts.join('; ');
}

export function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const entries = cookie.split(/;\s*/);
  for (const entry of entries) {
    const [k, ...rest] = entry.split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export async function createSession(username, secret, ttlSeconds = 86400) {
  const issued = Date.now();
  const exp = issued + ttlSeconds * 1000;
  const payload = JSON.stringify({ u: username, i: issued, e: exp });
  const sig = await hmacSign(secret, payload);
  const token = `${btoa(payload)}.${sig}`;
  return token;
}

export async function verifySession(token, secret) {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  let payloadStr;
  try { payloadStr = atob(payloadB64); } catch { return null; }
  const expected = await hmacSign(secret, payloadStr);
  if (expected !== sig) return null;
  let data;
  try { data = JSON.parse(payloadStr); } catch { return null; }
  if (Date.now() > (data.e || 0)) return null;
  return data; // { u, i, e }
}

export async function requireAuth(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  const session = await verifySession(token, env.SESSION_SECRET);
  if (!session) return null;
  const key = `users:${session.u}`;
  const userStr = await env.USERS.get(key);
  if (!userStr) return null;
  let user;
  try { user = JSON.parse(userStr); } catch { return null; }
  return { username: session.u, user };
}

export async function json(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

export function respondJSON(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function respondText(text, status = 200, extraHeaders = {}) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function randomId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}