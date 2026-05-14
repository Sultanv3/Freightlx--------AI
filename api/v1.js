/**
 * FREIGHTLX Backend — Vercel Serverless catch-all
 * Persists in Supabase Postgres + Storage via REST API (no SDK needed in Edge).
 *
 * Required env vars:
 *   SUPABASE_URL              — https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service_role secret key (server-side only)
 *   JWT_SECRET                — random 32+ char string
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pczfivhvnbewovvbquig.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'flx-default-secret-change-in-production-32chars';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-supabase-auth',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ═══════════════════════════════════════════════════════════════
//   Supabase REST helper (works in Edge runtime)
// ═══════════════════════════════════════════════════════════════
async function sb(path, opts = {}) {
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: opts.prefer || 'return=representation',
    ...(opts.headers || {}),
  };
  const init = { method: opts.method || 'GET', headers };
  if (opts.body) init.body = JSON.stringify(opts.body);
  const r = await fetch(url, init);
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Supabase ${r.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

// Verify Supabase user JWT (front-end issues these via Supabase Auth)
async function verifySupabaseJWT(token) {
  try {
    // Use Supabase's /auth/v1/user endpoint to verify
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return { id: user.id, email: user.email, role: user.user_metadata?.role || 'user' };
  } catch { return null; }
}

async function getUserFromAuth(req) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return await verifySupabaseJWT(token);
}

function genId(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════
//   Seed initial data for new users (idempotent)
// ═══════════════════════════════════════════════════════════════
async function seedUserData(userId) {
  try {
    const existing = await sb(`/shipments?user_id=eq.${userId}&select=id&limit=1`);
    if (existing && existing.length > 0) return; // already seeded

    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);

    await sb('/shipments', {
      method: 'POST',
      body: [
        { id: genId('FLX-B'), user_id: userId, origin: 'CNSHA', destination: 'SAJED', carrier: 'COSCO', container: '40HC', date: today, status: 'transit', status_text: 'في عرض البحر', price: 3450 },
        { id: genId('FLX-B'), user_id: userId, origin: 'CNSZX', destination: 'SADMM', carrier: 'MSC', container: '40GP', date: today, status: 'active', status_text: 'في التخليص', price: 2980 },
        { id: genId('FLX-B'), user_id: userId, origin: 'TRMER', destination: 'SAJED', carrier: 'Arkas', container: '20GP', date: today, status: 'pending', status_text: 'قيد الموافقة', price: 1650 },
      ],
      prefer: 'return=minimal',
    });

    await sb('/quotes', {
      method: 'POST',
      body: [
        { id: genId('Q'), user_id: userId, origin: 'CNSHA', destination: 'SAJED', carrier: 'COSCO', price: 3450, valid_until: future, status: 'valid' },
        { id: genId('Q'), user_id: userId, origin: 'INNSA', destination: 'SAJED', carrier: 'Maersk', price: 2720, valid_until: future, status: 'valid' },
      ],
      prefer: 'return=minimal',
    });

    await sb('/notifications', {
      method: 'POST',
      body: [{
        user_id: userId, type: 'info',
        text: 'مرحباً بك في FREIGHTLX 👋 — تم تجهيز حسابك بشحنات تجريبية',
      }],
      prefer: 'return=minimal',
    });
  } catch (err) {
    console.error('Seed failed:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//   MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1\/?/, '').replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);

  // ── Health (public) ──
  if (segments[0] === 'health' || segments.length === 0) {
    let dbStatus = 'unconfigured';
    if (SUPABASE_SERVICE_KEY) {
      try {
        await sb('/carriers?limit=1&select=code');
        dbStatus = 'connected';
      } catch (e) {
        dbStatus = 'error: ' + e.message.slice(0, 80);
      }
    }
    return json({
      status: 'ok',
      version: '2.0.0',
      time: new Date().toISOString(),
      services: {
        database: dbStatus,
        supabase_url: SUPABASE_URL,
        ai: process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : 'none',
      },
    });
  }

  // ── Public carriers list ──
  if (segments[0] === 'carriers' && req.method === 'GET') {
    try {
      const carriers = await sb('/carriers?active=eq.true&order=name.asc');
      return json({ data: carriers });
    } catch { return json({ data: [] }); }
  }

  // ── Bootstrap: ensure user has seed data ──
  if (segments[0] === 'bootstrap' && req.method === 'POST') {
    const user = await getUserFromAuth(req);
    if (!user) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    await seedUserData(user.id);
    return json({ ok: true });
  }

  // ── Auth: handled by Supabase directly, but expose /me ──
  if (segments[0] === 'auth' && segments[1] === 'me') {
    const user = await getUserFromAuth(req);
    if (!user) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    try {
      const [profile] = await sb(`/profiles?id=eq.${user.id}&select=*&limit=1`);
      return json({ user: profile || { id: user.id, email: user.email, role: user.role } });
    } catch {
      return json({ user });
    }
  }

  // ── Protected routes ──
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: { code: 'UNAUTHORIZED', message: 'Supabase Bearer token required' } }, 401);

  // Auto-seed on first request
  if (req.method === 'GET' && segments[0] === 'shipments' && !segments[1]) {
    await seedUserData(user.id);
  }

  try {
    // ── SHIPMENTS ──
    if (segments[0] === 'shipments') {
      if (req.method === 'GET' && !segments[1]) {
        const status = url.searchParams.get('status');
        let q = `/shipments?user_id=eq.${user.id}&select=*&order=created_at.desc`;
        if (status) q += `&status=eq.${status}`;
        const data = await sb(q);
        return json({ data, total: data.length, page: 1, limit: data.length });
      }
      if (req.method === 'GET' && segments[1]) {
        const [s] = await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}&select=*&limit=1`);
        if (!s) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json(s);
      }
      if (req.method === 'POST') {
        const body = await req.json();
        const id = body.id || genId('FLX-B');
        const [s] = await sb('/shipments', { method: 'POST', body: [{
          id, user_id: user.id,
          origin: body.origin, destination: body.destination,
          carrier: body.carrier, container: body.container || '40HC',
          price: body.price || 0, status: body.status || 'pending',
          status_text: body.status_text || 'قيد الموافقة',
          date: new Date().toISOString().slice(0, 10),
        }]});
        return json(s, 201);
      }
      if (req.method === 'PATCH' && segments[1]) {
        const body = await req.json();
        const [s] = await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}`, {
          method: 'PATCH', body,
        });
        if (!s) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json(s);
      }
      if (req.method === 'DELETE' && segments[1]) {
        await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'DELETE' });
        return json({ ok: true });
      }
    }

    // ── QUOTES ──
    if (segments[0] === 'quotes') {
      if (req.method === 'GET' && !segments[1]) {
        const data = await sb(`/quotes?user_id=eq.${user.id}&select=*&order=created_at.desc`);
        return json({ data, total: data.length, page: 1, limit: data.length });
      }
      if (req.method === 'POST' && !segments[1]) {
        const body = await req.json();
        const [q] = await sb('/quotes', { method: 'POST', body: [{
          id: body.id || genId('Q'), user_id: user.id,
          origin: body.origin, destination: body.destination,
          carrier: body.carrier, container: body.container || '40HC',
          price: body.price, valid_until: body.validUntil || body.valid_until,
          status: 'valid',
        }]});
        return json(q, 201);
      }
      if (req.method === 'POST' && segments[2] === 'book') {
        const [q] = await sb(`/quotes?id=eq.${segments[1]}&user_id=eq.${user.id}&select=*&limit=1`);
        if (!q) return json({ error: { code: 'NOT_FOUND' } }, 404);

        // Create shipment
        const shipmentId = genId('FLX-B');
        const [shipment] = await sb('/shipments', { method: 'POST', body: [{
          id: shipmentId, user_id: user.id,
          origin: q.origin, destination: q.destination,
          carrier: q.carrier, container: q.container || '40HC',
          price: q.price, status: 'pending', status_text: 'قيد الموافقة',
          date: new Date().toISOString().slice(0, 10),
          source_quote_id: q.id,
        }]});

        // Create invoice
        const invoiceId = genId('INV');
        const [invoice] = await sb('/invoices', { method: 'POST', body: [{
          id: invoiceId, user_id: user.id, shipment_id: shipmentId,
          description: `شحن ${q.origin} → ${q.destination} · ${q.carrier}`,
          amount: q.price + 580,
          status: 'pending',
        }]});

        // Mark quote as booked
        await sb(`/quotes?id=eq.${q.id}&user_id=eq.${user.id}`, {
          method: 'PATCH', body: { status: 'booked' }, prefer: 'return=minimal',
        });

        // Create notifications
        await sb('/notifications', { method: 'POST', body: [
          { user_id: user.id, type: 'success', text: `تم إنشاء شحنة <strong>${shipmentId}</strong> من العرض ${q.id}` },
          { user_id: user.id, type: 'info', text: `فاتورة جديدة <strong>${invoiceId}</strong> قيد التسديد ($${(q.price + 580).toLocaleString()})` },
        ], prefer: 'return=minimal' });

        return json({ shipment, invoice }, 201);
      }
      if (req.method === 'DELETE' && segments[1]) {
        await sb(`/quotes?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'DELETE' });
        return json({ ok: true });
      }
    }

    // ── INVOICES ──
    if (segments[0] === 'invoices') {
      if (req.method === 'GET' && !segments[1]) {
        const data = await sb(`/invoices?user_id=eq.${user.id}&select=*&order=created_at.desc`);
        return json({ data, total: data.length, page: 1, limit: data.length });
      }
      if (req.method === 'PATCH' && segments[1] && segments[2] === 'status') {
        const body = await req.json();
        const patch = { status: body.status };
        if (body.status === 'paid') patch.paid_at = new Date().toISOString();
        const [inv] = await sb(`/invoices?id=eq.${segments[1]}&user_id=eq.${user.id}`, {
          method: 'PATCH', body: patch,
        });
        if (!inv) return json({ error: { code: 'NOT_FOUND' } }, 404);
        if (body.status === 'paid') {
          await sb('/notifications', { method: 'POST', body: [{
            user_id: user.id, type: 'success',
            text: `تم استلام دفعة <strong>$${(inv.amount).toLocaleString()}</strong> للفاتورة ${inv.id}`,
          }], prefer: 'return=minimal' });
        }
        return json(inv);
      }
      if (req.method === 'GET' && segments[1] && segments[2] === 'data') {
        const [inv] = await sb(`/invoices?id=eq.${segments[1]}&user_id=eq.${user.id}&select=*&limit=1`);
        if (!inv) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json({
          invoice: inv,
          formatted: {
            number: inv.id, amount: inv.amount,
            vat_amount: inv.amount - inv.amount / 1.15,
            subtotal: inv.amount / 1.15, vat_rate: 0.15,
          },
        });
      }
    }

    // ── DOCUMENTS ──
    if (segments[0] === 'documents') {
      if (req.method === 'GET' && !segments[1]) {
        const data = await sb(`/documents?user_id=eq.${user.id}&select=*&order=created_at.desc`);
        return json({ data, total: data.length, page: 1, limit: data.length });
      }
    }

    // ── NOTIFICATIONS ──
    if (segments[0] === 'notifications') {
      if (req.method === 'GET' && !segments[1]) {
        const data = await sb(`/notifications?user_id=eq.${user.id}&select=*&order=created_at.desc&limit=50`);
        const unread = data.filter(n => !n.read).length;
        return json({ data, unread });
      }
      if (req.method === 'POST' && segments[1] === 'mark-read') {
        await sb(`/notifications?user_id=eq.${user.id}&read=eq.false`, {
          method: 'PATCH', body: { read: true }, prefer: 'return=minimal',
        });
        return json({ ok: true });
      }
    }

    // ── ADMIN ──
    if (segments[0] === 'admin') {
      // Verify admin role
      const [profile] = await sb(`/profiles?id=eq.${user.id}&select=role&limit=1`);
      if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
        return json({ error: { code: 'FORBIDDEN', message: 'Admin role required' } }, 403);
      }

      if (segments[1] === 'stats' && req.method === 'GET') {
        const [shipments, invoices, profiles, quotes] = await Promise.all([
          sb('/shipments?select=status,price'),
          sb('/invoices?select=status,amount'),
          sb('/profiles?select=id,status'),
          sb('/quotes?select=status'),
        ]);
        const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
        const pendingInvoices = invoices.filter(i => i.status === 'pending').length;
        const activeShipments = shipments.filter(s => ['active','transit','pending'].includes(s.status)).length;
        return json({
          totalRevenue, pendingInvoices, activeShipments,
          totalShipments: shipments.length,
          totalInvoices: invoices.length,
          totalQuotes: quotes.length,
          totalUsers: profiles.length,
        });
      }

      if (segments[1] === 'users' && req.method === 'GET') {
        const users = await sb('/profiles?select=*&order=created_at.desc');
        return json({ data: users, total: users.length });
      }
    }

    return json({ error: { code: 'NOT_FOUND', message: `${req.method} /${path} not found` } }, 404);

  } catch (err) {
    console.error('API error:', err.message);
    return json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  }
}

export const config = { runtime: 'edge' };
