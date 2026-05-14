/**
 * FREIGHTLX Backend — Vercel Serverless catch-all (v2.1.0)
 * Persists in Supabase Postgres + Storage via REST API (no SDK in Edge).
 * Adds: full carriers data, rate search engine with Freightify integration.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pczfivhvnbewovvbquig.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const FREIGHTIFY_API_KEY     = process.env.FREIGHTIFY_API_KEY || '';
const FREIGHTIFY_CUSTOMER_ID = process.env.FREIGHTIFY_CUSTOMER_ID || '';
const FREIGHTIFY_CLIENT_SECRET = process.env.FREIGHTIFY_CLIENT_SECRET || '';
const FREIGHTIFY_BASE_URL    = process.env.FREIGHTIFY_BASE_URL || '';

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

// ── Supabase REST helper ──
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
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Auth ──
async function verifySupabaseJWT(token) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return { id: user.id, email: user.email, role: user.user_metadata?.role || 'user' };
  } catch { return null; }
}

async function getUserFromAuth(req) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return await verifySupabaseJWT(auth.slice(7).trim());
}

function genId(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ── Seed user data (idempotent) ──
async function seedUserData(userId) {
  try {
    const existing = await sb(`/shipments?user_id=eq.${userId}&select=id&limit=1`);
    if (existing && existing.length > 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);

    await sb('/shipments', { method: 'POST', body: [
      { id: genId('FLX-B'), user_id: userId, origin: 'CNSHA', destination: 'SAJED', carrier: 'COSCO', container: '40HC', date: today, status: 'transit', status_text: 'في عرض البحر', price: 3450 },
      { id: genId('FLX-B'), user_id: userId, origin: 'CNSZX', destination: 'SADMM', carrier: 'MSC', container: '40GP', date: today, status: 'active', status_text: 'في التخليص', price: 2980 },
      { id: genId('FLX-B'), user_id: userId, origin: 'TRMER', destination: 'SAJED', carrier: 'Arkas', container: '20GP', date: today, status: 'pending', status_text: 'قيد الموافقة', price: 1650 },
    ], prefer: 'return=minimal' });

    await sb('/quotes', { method: 'POST', body: [
      { id: genId('Q'), user_id: userId, origin: 'CNSHA', destination: 'SAJED', carrier: 'COSCO', price: 3450, valid_until: future, status: 'valid' },
      { id: genId('Q'), user_id: userId, origin: 'INNSA', destination: 'SAJED', carrier: 'Maersk', price: 2720, valid_until: future, status: 'valid' },
    ], prefer: 'return=minimal' });

    await sb('/notifications', { method: 'POST', body: [{
      user_id: userId, type: 'info',
      text: 'مرحباً بك في FREIGHTLX 👋 — تم تجهيز حسابك بشحنات تجريبية',
    }], prefer: 'return=minimal' });
  } catch (err) {
    console.error('Seed failed:', err.message);
  }
}

// ── Freightify rate fetcher (best-effort with fallback) ──
async function fetchFreightifyRates(reqBody) {
  if (!FREIGHTIFY_API_KEY) return { source: 'no_credentials', offers: [] };
  const bases = [FREIGHTIFY_BASE_URL, 'https://link.freightify.com', 'https://api.freightify.com'].filter(Boolean);
  const paths = ['/v1/rates/search', '/api/v1/rates/search', '/v1/spot-rates/search'];
  const payload = {
    originPortCode: reqBody.originPort || reqBody.origin_port,
    destinationPortCode: reqBody.destinationPort || reqBody.destination_port,
    containerType: reqBody.containerType || reqBody.container_type || '40HC',
    commodityCode: reqBody.commodityCode || reqBody.commodity_code || '8517',
    cargoReadyDate: reqBody.cargoReadyDate || reqBody.cargo_ready_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    incoterms: reqBody.incoterms || 'FOB',
    weight: reqBody.cargo_weight_kg || reqBody.weight,
    volume: reqBody.cargo_volume_m3 || reqBody.volume,
  };
  for (const base of bases) {
    for (const p of paths) {
      try {
        const r = await fetch(`${base}${p}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', Accept: 'application/json',
            'X-API-Key': FREIGHTIFY_API_KEY, apikey: FREIGHTIFY_API_KEY,
            ...(FREIGHTIFY_CUSTOMER_ID ? { 'X-Customer-Id': FREIGHTIFY_CUSTOMER_ID } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!r.ok) continue;
        const data = await r.json().catch(() => null);
        if (!data) continue;
        const offers = data.rates || data.offers || data.results || data.data || (Array.isArray(data) ? data : null);
        if (Array.isArray(offers) && offers.length > 0) return { source: 'freightify', base, path: p, offers };
      } catch {}
    }
  }
  return { source: 'no_response', offers: [] };
}

// Build offers from active carriers in DB (real carriers, computed pricing)
async function buildOffersFromCarriers(reqBody) {
  const carriers = await sb('/carriers?active=eq.true&order=priority.asc&limit=15');
  const ctType = (reqBody.containerType || reqBody.container_type || '40HC').toUpperCase();
  const baseRates = {
    '20GP': 1500, '20HC': 1600, '40GP': 2800, '40HC': 2900, '40RF': 4500, '45HC': 3100, 'LCL': 80,
  };
  const base = baseRates[ctType] || baseRates['40HC'];
  const today = new Date();
  return carriers.map((c, i) => {
    const transit = (c.transit_days_avg || 25) + Math.floor(Math.random() * 4) - 2;
    const price = base + (c.priority * 30) + Math.floor(Math.random() * 200);
    return {
      carrier_code: c.code, carrier_name: c.name, carrier_logo: c.logo_url,
      brand_color: c.brand_color, country: c.country,
      route: `${reqBody.originPort || reqBody.origin_port || 'POL'} → ${reqBody.destinationPort || reqBody.destination_port || 'POD'}`,
      transit_days: transit, price, currency: 'USD',
      validity_until: new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10),
      vessel: `${c.name.split(' ')[0]} ${['Express','Pioneer','Champion','Harmony','Spirit'][i % 5]}`,
      etd: new Date(today.getTime() + (3 + i) * 86400000).toISOString().slice(0, 10),
      eta: new Date(today.getTime() + (3 + i + transit) * 86400000).toISOString().slice(0, 10),
      service_type: i % 3 === 0 ? 'Direct' : 'T/S Singapore',
      free_days: 10 + (i % 5), is_direct: i % 3 === 0,
    };
  }).sort((a, b) => a.price - b.price);
}

// ── MAIN HANDLER ──
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1\/?/, '').replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);

  // ── Health (public) ──
  if (segments[0] === 'health' || segments.length === 0) {
    let dbStatus = 'unconfigured';
    let carrierCount = 0;
    if (SUPABASE_SERVICE_KEY) {
      try {
        const result = await sb('/carriers?select=code&active=eq.true');
        carrierCount = result.length;
        dbStatus = 'connected';
      } catch (e) {
        dbStatus = 'error: ' + e.message.slice(0, 80);
      }
    }
    return json({
      status: 'ok', version: '2.1.0', time: new Date().toISOString(),
      services: {
        database: dbStatus, supabase_url: SUPABASE_URL,
        ai: process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : 'none',
        freightify: FREIGHTIFY_API_KEY ? 'configured' : 'not_configured',
        carriers_count: carrierCount,
      },
    });
  }

  // ── Public carriers list (full brand info, no auth required) ──
  if (segments[0] === 'carriers' && req.method === 'GET' && !segments[1]) {
    try {
      const onlyActive = url.searchParams.get('active') !== 'false';
      const filter = onlyActive ? 'active=eq.true&' : '';
      const carriers = await sb(`/carriers?${filter}order=priority.asc&select=code,name,country,brand_color,transit_days_avg,services,priority,logo_url,website,description_ar,active`);
      return json({ data: carriers, total: carriers.length });
    } catch (e) {
      return json({ error: { code: 'DB_ERROR', message: e.message } }, 500);
    }
  }

  // ── Bootstrap ──
  if (segments[0] === 'bootstrap' && req.method === 'POST') {
    const user = await getUserFromAuth(req);
    if (!user) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    await seedUserData(user.id);
    return json({ ok: true });
  }

  // ── /me ──
  if (segments[0] === 'auth' && segments[1] === 'me') {
    const user = await getUserFromAuth(req);
    if (!user) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    try {
      const [profile] = await sb(`/profiles?id=eq.${user.id}&select=*&limit=1`);
      return json({ user: profile || { id: user.id, email: user.email, role: user.role } });
    } catch { return json({ user }); }
  }

  // ── Protected routes ──
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: { code: 'UNAUTHORIZED', message: 'Supabase Bearer token required' } }, 401);

  if (req.method === 'GET' && segments[0] === 'shipments' && !segments[1]) {
    await seedUserData(user.id);
  }

  try {
    // ─── RATES ───
    if (segments[0] === 'rates') {
      if (segments[1] === 'search' && req.method === 'POST') {
        const body = await req.json();
        const t0 = Date.now();
        const requestId = genId('RR');

        let result = await fetchFreightifyRates(body);
        let usedSource = result.source;
        let normalized;

        if (result.offers.length > 0) {
          normalized = result.offers.map(r => ({
            carrier_name: r.carrierName || r.carrier || r.shippingLine || 'Carrier',
            route: `${r.originPortCode || body.originPort} → ${r.destinationPortCode || body.destinationPort}`,
            transit_days: r.transitTime || r.transit_days || 25,
            price: parseFloat(r.totalPrice || r.price || r.netRate || 0),
            currency: r.currency || 'USD',
            validity_until: (r.validityTo || r.validUntil || '').toString().slice(0, 10) || null,
            vessel: r.vesselName || r.vessel || `${r.carrierName || 'Vessel'} EXP`,
            etd: (r.etd || '').toString().slice(0, 10) || null,
            eta: (r.eta || '').toString().slice(0, 10) || null,
            service_type: r.routingType || (r.transhipment ? 'T/S' : 'Direct'),
            free_days: r.freeDaysAtDestination || r.freeDays || 10,
            is_direct: !r.transhipment,
          })).filter(o => o.price > 0).sort((a, b) => a.price - b.price);
        } else {
          normalized = await buildOffersFromCarriers(body);
          usedSource = 'carriers_db';
        }

        await sb('/rate_requests', { method: 'POST', body: [{
          id: requestId, user_id: user.id,
          origin_port: body.originPort || body.origin_port,
          destination_port: body.destinationPort || body.destination_port,
          container_type: body.containerType || body.container_type || '40HC',
          cargo_type: body.cargoType || body.cargo_type || 'FCL',
          commodity_code: body.commodityCode || body.commodity_code,
          commodity_name: body.commodityName || body.commodity_name,
          cargo_weight_kg: body.cargoWeightKg || body.cargo_weight_kg || null,
          cargo_volume_m3: body.cargoVolumeM3 || body.cargo_volume_m3 || null,
          cargo_ready_date: body.cargoReadyDate || body.cargo_ready_date || null,
          incoterms: body.incoterms || null,
          num_containers: body.numContainers || body.num_containers || 1,
          hazardous: !!(body.hazardous),
          source: usedSource, offers_count: normalized.length,
          duration_ms: Date.now() - t0,
        }], prefer: 'return=minimal' });

        if (normalized.length > 0) {
          await sb('/rate_offers', { method: 'POST', body: normalized.map(o => ({
            id: genId('OFR'), request_id: requestId,
            carrier_code: o.carrier_code || null, carrier_name: o.carrier_name,
            vessel: o.vessel, route: o.route, transit_days: o.transit_days,
            price: o.price, currency: o.currency, validity_until: o.validity_until,
            etd: o.etd, eta: o.eta, service_type: o.service_type,
            free_days: o.free_days, is_direct: o.is_direct, raw: null,
          })), prefer: 'return=minimal' });
        }

        return json({
          request_id: requestId, source: usedSource,
          offers: normalized, total: normalized.length,
          duration_ms: Date.now() - t0,
        });
      }

      if (segments[1] === 'requests' && req.method === 'GET' && !segments[2]) {
        const reqs = await sb(`/rate_requests?user_id=eq.${user.id}&select=*&order=created_at.desc&limit=50`);
        return json({ data: reqs, total: reqs.length });
      }

      if (segments[1] === 'requests' && segments[2] && segments[3] === 'offers') {
        const offers = await sb(`/rate_offers?request_id=eq.${segments[2]}&order=price.asc&select=*`);
        return json({ data: offers, total: offers.length });
      }
    }

    // ─── SHIPMENTS ───
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
          id, user_id: user.id, origin: body.origin, destination: body.destination,
          carrier: body.carrier, container: body.container || '40HC',
          price: body.price || 0, status: body.status || 'pending',
          status_text: body.status_text || 'قيد الموافقة',
          date: new Date().toISOString().slice(0, 10),
        }]});
        return json(s, 201);
      }
      if (req.method === 'PATCH' && segments[1]) {
        const body = await req.json();
        const [s] = await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'PATCH', body });
        if (!s) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json(s);
      }
      if (req.method === 'DELETE' && segments[1]) {
        await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'DELETE' });
        return json({ ok: true });
      }
    }

    // ─── QUOTES ───
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
        const shipmentId = genId('FLX-B');
        const [shipment] = await sb('/shipments', { method: 'POST', body: [{
          id: shipmentId, user_id: user.id,
          origin: q.origin, destination: q.destination, carrier: q.carrier,
          container: q.container || '40HC', price: q.price,
          status: 'pending', status_text: 'قيد الموافقة',
          date: new Date().toISOString().slice(0, 10), source_quote_id: q.id,
        }]});
        const invoiceId = genId('INV');
        const [invoice] = await sb('/invoices', { method: 'POST', body: [{
          id: invoiceId, user_id: user.id, shipment_id: shipmentId,
          description: `شحن ${q.origin} → ${q.destination} · ${q.carrier}`,
          amount: q.price + 580, status: 'pending',
        }]});
        await sb(`/quotes?id=eq.${q.id}&user_id=eq.${user.id}`, {
          method: 'PATCH', body: { status: 'booked' }, prefer: 'return=minimal',
        });
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

    // ─── INVOICES ───
    if (segments[0] === 'invoices') {
      if (req.method === 'GET' && !segments[1]) {
        const data = await sb(`/invoices?user_id=eq.${user.id}&select=*&order=created_at.desc`);
        return json({ data, total: data.length, page: 1, limit: data.length });
      }
      if (req.method === 'PATCH' && segments[1] && segments[2] === 'status') {
        const body = await req.json();
        const patch = { status: body.status };
        if (body.status === 'paid') patch.paid_at = new Date().toISOString();
        const [inv] = await sb(`/invoices?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'PATCH', body: patch });
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

    // ─── DOCUMENTS ───
    if (segments[0] === 'documents' && req.method === 'GET' && !segments[1]) {
      const data = await sb(`/documents?user_id=eq.${user.id}&select=*&order=created_at.desc`);
      return json({ data, total: data.length, page: 1, limit: data.length });
    }

    // ─── NOTIFICATIONS ───
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

    // ─── ADMIN ───
    if (segments[0] === 'admin') {
      const [profile] = await sb(`/profiles?id=eq.${user.id}&select=role&limit=1`);
      if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
        return json({ error: { code: 'FORBIDDEN', message: 'Admin role required' } }, 403);
      }
      if (segments[1] === 'stats' && req.method === 'GET') {
        const [shipments, invoices, profiles, quotes, rateReqs] = await Promise.all([
          sb('/shipments?select=status,price'),
          sb('/invoices?select=status,amount'),
          sb('/profiles?select=id,status'),
          sb('/quotes?select=status'),
          sb('/rate_requests?select=id'),
        ]);
        const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
        return json({
          totalRevenue,
          pendingInvoices: invoices.filter(i => i.status === 'pending').length,
          activeShipments: shipments.filter(s => ['active','transit','pending'].includes(s.status)).length,
          totalShipments: shipments.length, totalInvoices: invoices.length,
          totalQuotes: quotes.length, totalUsers: profiles.length,
          totalRateRequests: rateReqs.length,
        });
      }
      if (segments[1] === 'users' && req.method === 'GET') {
        const users = await sb('/profiles?select=*&order=created_at.desc');
        return json({ data: users, total: users.length });
      }
      // Admin carrier management
      if (segments[1] === 'carriers') {
        if (req.method === 'GET' && !segments[2]) {
          const carriers = await sb('/carriers?select=*&order=priority.asc');
          return json({ data: carriers, total: carriers.length });
        }
        if (req.method === 'POST' && !segments[2]) {
          const body = await req.json();
          const [c] = await sb('/carriers', { method: 'POST', body: [body]});
          return json(c, 201);
        }
        if (req.method === 'PATCH' && segments[2]) {
          const body = await req.json();
          const [c] = await sb(`/carriers?code=eq.${segments[2]}`, { method: 'PATCH', body });
          if (!c) return json({ error: { code: 'NOT_FOUND' } }, 404);
          return json(c);
        }
        if (req.method === 'DELETE' && segments[2]) {
          await sb(`/carriers?code=eq.${segments[2]}`, { method: 'DELETE' });
          return json({ ok: true });
        }
      }
    }

    return json({ error: { code: 'NOT_FOUND', message: `${req.method} /${path} not found` } }, 404);
  } catch (err) {
    console.error('API error:', err.message);
    return json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  }
}

export const config = { runtime: 'edge' };
