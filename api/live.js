/**
 * FREIGHTLX Live Stream — Server-Sent Events (v3.0)
 *
 * GET /api/live?token=<JWT>            → SSE stream of user-scoped events
 * GET /api/live?token=<JWT>&role=admin → admin-wide event stream
 * POST /api/live/publish                → admin broadcasts an event
 *
 * Events are polled from Supabase tables every 4s and pushed as SSE.
 * In a future iteration this can be swapped for Supabase Realtime channels.
 */

export const config = { runtime: 'nodejs', maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function sb(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SVC,
      Authorization: `Bearer ${SUPABASE_SVC}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function getUserFromJWT(jwt) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function getUserRole(userId) {
  try {
    const r = await sb(`/profiles?id=eq.${userId}&select=role,full_name`);
    if (!r.ok) return 'user';
    const j = await r.json();
    return j[0]?.role || 'user';
  } catch { return 'user'; }
}

async function snapshot(userId, isAdmin) {
  // Snapshot of state — counts and most-recent events
  const f = (path) => sb(path).then(r => r.ok ? r.json() : []).catch(() => []);

  const filter = isAdmin ? '' : `&user_id=eq.${userId}`;

  const [shipments, quotes, invoices, notifs] = await Promise.all([
    f(`/shipments?select=id,status,user_id,updated_at&order=updated_at.desc&limit=20${filter}`),
    f(`/quotes?select=id,status,user_id,created_at&order=created_at.desc&limit=10${filter}`),
    f(`/invoices?select=id,status,user_id,amount,created_at&order=created_at.desc&limit=10${filter}`),
    f(`/notifications?select=id,title,message,read,created_at${filter}&order=created_at.desc&limit=15`),
  ]);

  return {
    ts: Date.now(),
    shipments,
    quotes,
    invoices,
    notifications: notifs,
    counts: {
      shipments: shipments.length,
      active: shipments.filter(s => ['pending', 'transit', 'active'].includes(s.status)).length,
      quotes: quotes.length,
      invoices_pending: invoices.filter(i => i.status === 'pending').length,
      unread_notifs: notifs.filter(n => !n.read).length,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') { res.statusCode = 405; res.end('GET only'); return; }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const token = url.searchParams.get('token') ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const wantAdmin = url.searchParams.get('role') === 'admin';

  if (!token) { res.statusCode = 401; res.end('token required'); return; }

  const user = await getUserFromJWT(token);
  if (!user || !user.id) { res.statusCode = 401; res.end('invalid token'); return; }

  const role = await getUserRole(user.id);
  const isAdmin = wantAdmin && (role === 'admin' || role === 'super_admin');

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.statusCode = 200;

  const write = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  // Greeting + initial snapshot
  write('hello', { ok: true, user: { id: user.id, email: user.email }, role, isAdmin });
  try {
    const snap = await snapshot(user.id, isAdmin);
    write('snapshot', snap);
  } catch (e) {
    write('error', { error: String(e?.message || e) });
  }

  // Heartbeat + poll loop
  let lastSnap = null;
  const interval = setInterval(async () => {
    try {
      const snap = await snapshot(user.id, isAdmin);
      // Diff: send only when something changed
      const sig = JSON.stringify(snap.counts) + '|' +
        (snap.shipments || []).map(s => s.id + ':' + s.status + ':' + s.updated_at).join(',');
      if (sig !== lastSnap) {
        lastSnap = sig;
        write('update', snap);
      } else {
        write('ping', { ts: Date.now() });
      }
    } catch (e) {
      write('error', { error: String(e?.message || e) });
    }
  }, 4500);

  // Cleanup
  req.on('close', () => { clearInterval(interval); try { res.end(); } catch {} });
  req.on('error', () => { clearInterval(interval); try { res.end(); } catch {} });

  // Cap at maxDuration (Vercel will kill anyway)
  setTimeout(() => { clearInterval(interval); try { res.end(); } catch {} }, 280000);
}
