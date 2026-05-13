/**
 * FREIGHTLX Backend — Vercel Serverless catch-all
 * One Edge function handling all /api/v1/* requests.
 * Uses Supabase Auth (cookie/header) + in-memory cache.
 * Persists via Vercel Edge Config or Supabase tables when configured.
 */

// In-memory store (per-instance — survives warm invocations)
const memStore = {
  users: new Map(),
  shipments: new Map(),
  quotes: new Map(),
  invoices: new Map(),
  documents: new Map(),
  notifications: new Map(),
};

// Seed demo data if empty
function ensureSeed(userId) {
  if (memStore.shipments.size > 0) return;
  const seedShipments = [
    { id: 'FLX-B-2026-7841', user_id: userId, origin: 'CNSHA', destination: 'SAJED', carrier: 'COSCO',  container: '40HC', date: '2026-04-28', status: 'transit',   status_text: 'في عرض البحر',    price: 3450 },
    { id: 'FLX-B-2026-7639', user_id: userId, origin: 'CNSZX', destination: 'SADMM', carrier: 'MSC',    container: '40GP', date: '2026-04-30', status: 'active',    status_text: 'في التخليص',      price: 2980 },
    { id: 'FLX-B-2026-7421', user_id: userId, origin: 'TRMER', destination: 'SAJED', carrier: 'Arkas',  container: '20GP', date: '2026-05-02', status: 'pending',   status_text: 'قيد الموافقة',    price: 1650 },
    { id: 'FLX-B-2026-7102', user_id: userId, origin: 'INNSA', destination: 'SAJED', carrier: 'Maersk', container: '40HC', date: '2026-04-10', status: 'completed', status_text: 'مكتملة',          price: 2720 }
  ];
  seedShipments.forEach(s => memStore.shipments.set(s.id, s));

  [
    { id: 'Q-2026-1284', user_id: userId, origin: 'CNSHA', destination: 'SAJED', carrier: 'COSCO',  price: 3450, valid_until: '2026-05-20', status: 'valid' },
    { id: 'Q-2026-1283', user_id: userId, origin: 'CNSZX', destination: 'SADMM', carrier: 'MSC',    price: 2980, valid_until: '2026-05-19', status: 'valid' },
    { id: 'Q-2026-1281', user_id: userId, origin: 'TRMER', destination: 'SAJED', carrier: 'Arkas',  price: 1650, valid_until: '2026-05-25', status: 'valid' },
  ].forEach(q => memStore.quotes.set(q.id, q));

  [
    { id: 'INV-2026-152', user_id: userId, description: 'شحن CNSHA → SAJED · COSCO 40HC', date: '2026-05-08', amount: 3450, status: 'paid' },
    { id: 'INV-2026-150', user_id: userId, description: 'شحن CNSZX → SADMM · MSC 40GP', date: '2026-05-02', amount: 2980, status: 'pending' },
    { id: 'INV-2026-149', user_id: userId, description: 'تخليص جمركي + رسوم', date: '2026-04-30', amount: 720, status: 'pending' },
  ].forEach(i => memStore.invoices.set(i.id, i));
}

// Hash/sign helpers (simple JWT-like for Edge runtime)
async function sign(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = btoa(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

async function verify(token, secret) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const expectedSig = await crypto.subtle.sign('HMAC', key, enc.encode(`${headerB64}.${payloadB64}`));
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));
    if (sigB64 !== expectedB64) return null;
    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

const JWT_SECRET = process.env.JWT_SECRET || 'flx-default-secret-change-in-production-32chars';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function getUserFromAuth(req) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return await verify(auth.slice(7), JWT_SECRET);
}

// Simple password hash (Edge runtime compatible)
async function hashPassword(pw) {
  const data = new TextEncoder().encode(pw + 'flx-salt-v1');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

function genId(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ════════════════════════════════════════════════════════
//  MAIN HANDLER
// ════════════════════════════════════════════════════════
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1\/?/, '').replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);

  // ── Health ──
  if (segments[0] === 'health' || segments.length === 0) {
    return json({
      status: 'ok', version: '1.0.0', time: new Date().toISOString(),
      services: { database: 'memory', ai: !!process.env.GEMINI_API_KEY ? 'gemini' : 'none' },
      message: 'FREIGHTLX Serverless API',
    });
  }

  // ── Auth ──
  if (segments[0] === 'auth') {
    let body = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch {}
    }

    if (segments[1] === 'signup' && req.method === 'POST') {
      const { email, password, name } = body;
      if (!email || !password || !name) return json({ error: { code: 'VALIDATION', message: 'email, password, name required' } }, 422);
      if (password.length < 8) return json({ error: { code: 'WEAK_PASSWORD', message: 'Password must be 8+ chars' } }, 422);
      if (memStore.users.has(email)) return json({ error: { code: 'CONFLICT', message: 'Email already registered' } }, 409);

      const userId = genId('U');
      const hash = await hashPassword(password);
      memStore.users.set(email, { id: userId, email, name, password_hash: hash, role: 'user', created_at: new Date().toISOString() });
      ensureSeed(userId);

      const token = await sign({ id: userId, email, role: 'user', exp: Math.floor(Date.now()/1000) + 7*86400 }, JWT_SECRET);
      const refresh = await sign({ id: userId, email, role: 'user', exp: Math.floor(Date.now()/1000) + 30*86400 }, JWT_SECRET);

      return json({
        user: { id: userId, email, name, role: 'user' },
        access_token: token, refresh_token: refresh, token_type: 'Bearer', expires_in: '7d',
      }, 201);
    }

    if (segments[1] === 'login' && req.method === 'POST') {
      const { email, password } = body;
      const stored = memStore.users.get(email);
      if (!stored) return json({ error: { code: 'INVALID_CREDS', message: 'Invalid email or password' } }, 401);
      const hash = await hashPassword(password);
      if (hash !== stored.password_hash) return json({ error: { code: 'INVALID_CREDS', message: 'Invalid email or password' } }, 401);
      ensureSeed(stored.id);

      const token = await sign({ id: stored.id, email, role: stored.role, exp: Math.floor(Date.now()/1000) + 7*86400 }, JWT_SECRET);
      const refresh = await sign({ id: stored.id, email, role: stored.role, exp: Math.floor(Date.now()/1000) + 30*86400 }, JWT_SECRET);

      return json({
        user: { id: stored.id, email, name: stored.name, role: stored.role },
        access_token: token, refresh_token: refresh, token_type: 'Bearer', expires_in: '7d',
      });
    }

    if (segments[1] === 'refresh' && req.method === 'POST') {
      const { refresh_token } = body;
      const payload = await verify(refresh_token, JWT_SECRET);
      if (!payload) return json({ error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } }, 401);
      const token = await sign({ id: payload.id, email: payload.email, role: payload.role, exp: Math.floor(Date.now()/1000) + 7*86400 }, JWT_SECRET);
      return json({ access_token: token, refresh_token, token_type: 'Bearer', expires_in: '7d' });
    }

    if (segments[1] === 'me') {
      const user = await getUserFromAuth(req);
      if (!user) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
      const stored = Array.from(memStore.users.values()).find(u => u.id === user.id);
      return json({ user: stored ? { id: stored.id, email: stored.email, name: stored.name, role: stored.role } : null });
    }

    if (segments[1] === 'logout') return json({ ok: true });

    return json({ error: { code: 'NOT_FOUND' } }, 404);
  }

  // ── Protected routes ──
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } }, 401);
  ensureSeed(user.id);

  function listResource(table) {
    const all = Array.from(memStore[table].values()).filter(r => r.user_id === user.id);
    return { data: all, total: all.length, page: 1, limit: all.length };
  }

  // ── Shipments ──
  if (segments[0] === 'shipments') {
    if (req.method === 'GET' && !segments[1]) return json(listResource('shipments'));
    if (req.method === 'GET' && segments[1]) {
      const s = memStore.shipments.get(segments[1]);
      if (!s || s.user_id !== user.id) return json({ error: { code: 'NOT_FOUND' } }, 404);
      return json(s);
    }
    if (req.method === 'POST') {
      const body = await req.json();
      const id = body.id || genId('FLX-B');
      const shipment = {
        id, user_id: user.id,
        origin: body.origin, destination: body.destination,
        carrier: body.carrier, container: body.container || '40HC',
        price: body.price || 0, status: body.status || 'pending',
        status_text: body.status_text || 'قيد الموافقة',
        date: new Date().toISOString().slice(0, 10),
      };
      memStore.shipments.set(id, shipment);
      return json(shipment, 201);
    }
    if (req.method === 'PATCH' && segments[1]) {
      const s = memStore.shipments.get(segments[1]);
      if (!s || s.user_id !== user.id) return json({ error: { code: 'NOT_FOUND' } }, 404);
      const body = await req.json();
      Object.assign(s, body, { updated_at: new Date().toISOString() });
      return json(s);
    }
  }

  // ── Quotes ──
  if (segments[0] === 'quotes') {
    if (req.method === 'GET') return json(listResource('quotes'));
    if (req.method === 'POST' && segments[2] === 'book') {
      const q = memStore.quotes.get(segments[1]);
      if (!q) return json({ error: { code: 'NOT_FOUND' } }, 404);
      const shipmentId = genId('FLX-B');
      const shipment = { id: shipmentId, user_id: user.id, origin: q.origin, destination: q.destination, carrier: q.carrier, container: '40HC', price: q.price, status: 'pending', status_text: 'قيد الموافقة', date: new Date().toISOString().slice(0, 10) };
      memStore.shipments.set(shipmentId, shipment);
      const invId = genId('INV');
      const invoice = { id: invId, user_id: user.id, description: `شحن ${q.origin} → ${q.destination} · ${q.carrier}`, date: new Date().toISOString().slice(0, 10), amount: q.price + 580, status: 'pending' };
      memStore.invoices.set(invId, invoice);
      q.status = 'booked';
      return json({ shipment, invoice }, 201);
    }
  }

  // ── Invoices ──
  if (segments[0] === 'invoices') {
    if (req.method === 'GET' && !segments[1]) return json(listResource('invoices'));
    if (req.method === 'PATCH' && segments[1] && segments[2] === 'status') {
      const i = memStore.invoices.get(segments[1]);
      if (!i || i.user_id !== user.id) return json({ error: { code: 'NOT_FOUND' } }, 404);
      const body = await req.json();
      i.status = body.status;
      if (body.status === 'paid') i.paid_at = new Date().toISOString();
      return json(i);
    }
    if (req.method === 'GET' && segments[1] && segments[2] === 'data') {
      const i = memStore.invoices.get(segments[1]);
      if (!i || i.user_id !== user.id) return json({ error: { code: 'NOT_FOUND' } }, 404);
      return json({ invoice: i, formatted: { number: i.id, amount: i.amount, vat_amount: i.amount - i.amount/1.15, subtotal: i.amount/1.15, vat_rate: 0.15 } });
    }
  }

  // ── Documents ──
  if (segments[0] === 'documents' && req.method === 'GET') {
    return json(listResource('documents'));
  }

  // ── Notifications ──
  if (segments[0] === 'notifications') {
    if (req.method === 'GET' && !segments[1]) {
      const all = Array.from(memStore.notifications.values()).filter(n => n.user_id === user.id);
      return json({ data: all, unread: all.filter(n => !n.read).length });
    }
    if (req.method === 'POST' && segments[1] === 'mark-read') {
      Array.from(memStore.notifications.values())
        .filter(n => n.user_id === user.id)
        .forEach(n => n.read = true);
      return json({ ok: true });
    }
  }

  // ── Admin ──
  if (segments[0] === 'admin') {
    if (segments[1] === 'stats') {
      const ships = Array.from(memStore.shipments.values());
      const invs = Array.from(memStore.invoices.values());
      const paid = invs.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
      return json({
        totalRevenue: paid,
        totalShipments: ships.length,
        totalInvoices: invs.length,
        totalUsers: memStore.users.size,
        activeShipments: ships.filter(s => ['active','transit','pending'].includes(s.status)).length,
      });
    }
  }

  return json({ error: { code: 'NOT_FOUND', message: `${req.method} /${path} not found` } }, 404);
}

export const config = { runtime: 'edge' };
