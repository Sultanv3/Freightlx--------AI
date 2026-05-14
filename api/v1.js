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
const FREIGHTIFY_USERNAME    = process.env.FREIGHTIFY_USERNAME || '';
const FREIGHTIFY_PASSWORD    = process.env.FREIGHTIFY_PASSWORD || '';
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

// ─── Freightify integration (OAuth2 + v4 /prices) ───────────────────
// Token cache (module-scope; survives warm Edge invocations)
let _fxToken = null;
let _fxTokenExpiry = 0;

const FX_BASE = FREIGHTIFY_BASE_URL || 'https://api.freightify.com';

/**
 * Fetch OAuth2 access_token from Freightify.
 * Replicates the working Laravel flow:
 *   POST {base}/oauth2/token
 *   Authorization: Basic base64(customer_id:client_secret)
 *   x-api-key: <API_KEY>
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=password&username=...&password=...
 */
async function fxGetToken(force = false) {
  if (!force && _fxToken && Date.now() < _fxTokenExpiry - 30_000) return _fxToken;
  if (!FREIGHTIFY_CUSTOMER_ID || !FREIGHTIFY_CLIENT_SECRET) {
    throw new Error('Freightify credentials missing (CUSTOMER_ID / CLIENT_SECRET).');
  }
  if (!FREIGHTIFY_USERNAME || !FREIGHTIFY_PASSWORD) {
    throw new Error('Freightify username/password missing. Set FREIGHTIFY_USERNAME and FREIGHTIFY_PASSWORD.');
  }

  const tokenUrl = `${FX_BASE}/oauth2/token`;
  const basic = btoa(`${FREIGHTIFY_CUSTOMER_ID}:${FREIGHTIFY_CLIENT_SECRET}`);

  const body = new URLSearchParams();
  body.set('grant_type', 'password');
  body.set('username', FREIGHTIFY_USERNAME);
  body.set('password', FREIGHTIFY_PASSWORD);
  body.set('scope', '*'); // Freightify OpenAPI declares scope "*"

  // Hard 6-second timeout to avoid Vercel edge gateway timeouts
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let r;
  try {
    r = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
        ...(FREIGHTIFY_API_KEY ? { 'x-api-key': FREIGHTIFY_API_KEY } : {}),
        'User-Agent': 'freightlx-platform',
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error(`Freightify auth timeout after 6s (${tokenUrl})`);
    throw new Error(`Freightify auth network error: ${e.message}`);
  }
  clearTimeout(timeoutId);

  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Freightify auth ${r.status}: ${text.slice(0, 300)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Freightify auth: invalid JSON response'); }

  const token = data.access_token || data.accessToken || data.token;
  if (!token) {
    throw new Error('Freightify auth: missing access_token in response. Keys: ' + Object.keys(data).join(','));
  }
  const expiresIn = parseInt(data.expires_in || data.expiresIn || 3600);
  // Buffer of 2 min so we refresh before expiry
  const ttl = Math.max(60, expiresIn - 120);
  _fxToken = token;
  _fxTokenExpiry = Date.now() + ttl * 1000;
  return token;
}

/** Build query string for /v3/prices — matches working Laravel implementation. */
function fxBuildPricesQuery(reqBody) {
  const mode = (reqBody.mode || 'FCL').toUpperCase();
  const origin = reqBody.originPort || reqBody.origin_port;
  const dest   = reqBody.destinationPort || reqBody.destination_port;
  let ctype    = (reqBody.containerType || reqBody.container_type || '40HC').toUpperCase();
  // Freightify wants: 20GP, 40GP, 40HC (not 40FT, etc.)
  if (ctype === '40FT' || ctype === '40DC') ctype = '40GP';
  if (ctype === '20FT' || ctype === '20DC') ctype = '20GP';
  if (ctype === 'ALL') ctype = '40HC';

  const weight = reqBody.cargoWeightKg || reqBody.weight || 25000;
  const departure = reqBody.cargoReadyDate || reqBody.cargo_ready_date || reqBody.departureDate ||
                    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // Freightify Master Load format: 1X40HCX25000XKG  →  {qty}X{type}X{weight}X{unit}
  // We use qty=1 here; UI multiplies by user's quantity for booking.
  const containers = `1X${ctype}X${weight}XKG`;

  const params = new URLSearchParams();
  params.append('originType', 'PORT');
  params.append('destinationType', 'PORT');
  params.append('mode', mode);
  params.append('origin', origin);
  params.append('destination', dest);
  params.append('departureDate', departure);
  params.append('containers', containers);
  return params.toString();
}

/** Normalize a Freightify /v3/prices offer — matches Laravel mapOffer() shape. */
function fxNormalizeOffer(raw, fallbackRoute) {
  // Freightify v3 shape: { freightifyId, productOffer: {...}, productPrice: {...} }
  const productOffer = raw.productOffer || {};
  const productPrice = raw.productPrice || {};

  const carrierName = productOffer.carrierName || raw.carrierName || 'Unknown';
  const carrierScac = productOffer.carrierScac || raw.carrierScac || '';

  // Price: prefer SELL, then BUY, in USD
  const usdAmount = productPrice.totalUSDAmount || {};
  const totalPrice = parseFloat(usdAmount.SELL || usdAmount.BUY || productPrice.total || raw.totalPrice || 0);

  const transit = parseInt(productPrice.transitTimeInDays || raw.transitTime || raw.transit_days || 0) || 25;
  const validTo = productPrice.validTo || raw.validTo || raw.validityTo;
  const etd = productOffer.departureDate || raw.etd || raw.departureDate;
  const eta = productOffer.arrivalDate   || raw.eta || raw.arrivalDate;

  const transhipment = !!(productOffer.transhipment || raw.transhipment ||
    (productOffer.viaPorts && productOffer.viaPorts.length > 0));

  return {
    carrier_code: carrierScac,
    carrier_name: carrierName,
    vessel: productOffer.vesselName || raw.vesselName || `${carrierName} Service`,
    route: productOffer.routing || raw.routing || fallbackRoute,
    transit_days: transit,
    price: totalPrice,
    currency: 'USD',
    validity_until: validTo ? validTo.toString().slice(0, 10) : null,
    etd: etd ? etd.toString().slice(0, 10) : null,
    eta: eta ? eta.toString().slice(0, 10) : null,
    service_type: productOffer.serviceType || (transhipment ? 'T/S' : 'Direct'),
    free_days: parseInt(productOffer.freeDays || productPrice.freeDays || 10),
    is_direct: !transhipment,
    raw_id: raw.freightifyId || raw._id || raw.id,
  };
}

/** Poll /v3/prices/{reqId} for offers — 4 attempts × 2s = 8s budget. */
async function fxPollOffers(reqId, token) {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const c = new AbortController();
      const tid = setTimeout(() => c.abort(), 3000);
      const r = await fetch(`${FX_BASE}/v3/prices/${reqId}?offset=0&limit=30`, {
        headers: {
          'x-api-key': FREIGHTIFY_API_KEY,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: c.signal,
      }).finally(() => clearTimeout(tid));
      if (!r.ok) continue;
      const d = await r.json().catch(() => ({}));
      const offers = d.offers || (d.data && d.data.offers);
      const status = d.status || (d.data && d.data.status);
      // If COMPLETED OR we got offers, return them
      if (Array.isArray(offers) && offers.length > 0) {
        if (status === 'COMPLETED' || i >= 3) return offers;
      }
    } catch {}
  }
  return null;
}

/** Main: call Freightify v4 /prices and return normalized offers. */
async function fetchFreightifyRates(reqBody) {
  if (!FREIGHTIFY_API_KEY || !FREIGHTIFY_CUSTOMER_ID) {
    return { source: 'no_credentials', offers: [], error: 'API key or Customer ID missing' };
  }
  const trace = { steps: [] };
  try {
    const token = await fxGetToken();
    trace.steps.push('token_ok');

    const query = fxBuildPricesQuery(reqBody);
    const url = `${FX_BASE}/v3/prices?${query}`;
    trace.steps.push('query_built');

    // 50s timeout — Vercel Pro + Fluid Compute allows 60s total budget.
    // Gives Freightify ample time for slow rate fan-out (typical 30-50s).
    const c1 = new AbortController();
    const tid1 = setTimeout(() => c1.abort(), 50000);
    let r;
    try {
      r = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': FREIGHTIFY_API_KEY,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: c1.signal,
      });
    } catch (e) {
      clearTimeout(tid1);
      if (e.name === 'AbortError') {
        trace.steps.push('prices_timeout_50s');
        return { source: 'freightify_timeout', offers: [], error: 'Freightify did not respond within 50s', trace, url };
      }
      throw e;
      throw e;
    }
    clearTimeout(tid1);
    const text = await r.text();
    trace.steps.push(`prices_${r.status}`);
    if (!r.ok) {
      return { source: 'freightify_error', offers: [], error: `HTTP ${r.status}: ${text.slice(0, 300)}`, trace, url };
    }
    let data;
    try { data = JSON.parse(text); } catch { return { source: 'freightify_invalid_json', offers: [], error: 'invalid JSON', trace }; }

    // Freightify v3 returns offers at top level; v4 nests under data.data.offers
    let offers = data.offers || data.rates || data.prices || data.results ||
                 (data.data && data.data.offers) || (data.data && data.data.rates) ||
                 (Array.isArray(data.data) ? data.data : null) ||
                 (Array.isArray(data) ? data : null);

    // Capture reqId for async polling pattern (UI can poll later)
    const reqIdField = data.reqId || data.requestId || (data.data && (data.data.reqId || data.data.requestId));
    const apiStatus = data.status || (data.data && data.data.status) || null;
    const fallbackRoute = `${reqBody.originPort || reqBody.origin_port} → ${reqBody.destinationPort || reqBody.destination_port}`;

    // If we got partial offers + reqId still INPROGRESS → return them + reqId so UI keeps polling
    if (Array.isArray(offers) && offers.length > 0) {
      return {
        source: 'freightify',
        offers: offers.map(o => fxNormalizeOffer(o, fallbackRoute)),
        reqId: reqIdField || null,
        api_status: apiStatus,
        in_progress: apiStatus === 'INPROGRESS',
        trace,
      };
    }

    // No offers yet but we have reqId → return empty + reqId, UI will poll
    if (reqIdField) {
      return {
        source: 'freightify_in_progress',
        offers: [],
        reqId: reqIdField,
        api_status: apiStatus || 'INPROGRESS',
        in_progress: true,
        trace,
      };
    }

    return { source: 'freightify_empty', offers: [], error: 'no offers and no reqId in response', trace, sample: text.slice(0, 500) };

  } catch (err) {
    return { source: 'freightify_exception', offers: [], error: err.message, trace };
  }
}

// Lane-aware base rates (rough market prices, USD per container)
// Distance multipliers for major Saudi destinations from world origins
function laneMultiplier(origin, destination) {
  const o = (origin || '').toUpperCase();
  const d = (destination || '').toUpperCase();
  // Origin region multipliers
  let baseMul = 1.0;
  if (o.startsWith('CN') || o.startsWith('HK')) baseMul = 1.0;      // China/HK baseline
  else if (o.startsWith('IN')) baseMul = 0.75;                       // India shorter
  else if (o.startsWith('TR')) baseMul = 0.55;                       // Turkey closest
  else if (o.startsWith('AE') || o.startsWith('OM')) baseMul = 0.35;  // Gulf neighbors
  else if (o.startsWith('US')) baseMul = 1.4;                        // USA longest
  else if (o.startsWith('DE') || o.startsWith('NL') || o.startsWith('FR') || o.startsWith('IT') || o.startsWith('ES') || o.startsWith('GB')) baseMul = 1.05;
  else if (o.startsWith('SG') || o.startsWith('MY') || o.startsWith('TH') || o.startsWith('VN') || o.startsWith('ID')) baseMul = 0.85;
  else if (o.startsWith('JP') || o.startsWith('KR')) baseMul = 1.1;
  else if (o.startsWith('EG')) baseMul = 0.45;
  // Destination — SA ports
  let destMul = 1.0;
  if (d.startsWith('SA')) destMul = 1.0;                              // KSA is our market
  return baseMul * destMul;
}

// Realistic transit days by lane
function laneTransitDays(origin, destination) {
  const o = (origin || '').toUpperCase();
  if (o.startsWith('CN') || o.startsWith('HK')) return 21;
  if (o.startsWith('IN')) return 12;
  if (o.startsWith('TR')) return 8;
  if (o.startsWith('AE') || o.startsWith('OM')) return 3;
  if (o.startsWith('US')) return 35;
  if (o.startsWith('DE') || o.startsWith('NL') || o.startsWith('FR') || o.startsWith('GB') || o.startsWith('IT') || o.startsWith('ES')) return 18;
  if (o.startsWith('SG') || o.startsWith('MY') || o.startsWith('TH')) return 16;
  if (o.startsWith('JP') || o.startsWith('KR')) return 22;
  if (o.startsWith('EG')) return 6;
  return 25;
}

// Fetch Freightify's live carriers list (75+ real carriers)
let _fxCarriersCache = null;
let _fxCarriersExpiry = 0;
async function fxGetLiveCarriers() {
  if (_fxCarriersCache && Date.now() < _fxCarriersExpiry) return _fxCarriersCache;
  try {
    const token = await fxGetToken();
    const c = new AbortController();
    const tid = setTimeout(() => c.abort(), 4000);
    const r = await fetch(`${FX_BASE}/v1/carriers`, {
      headers: {
        'x-api-key': FREIGHTIFY_API_KEY,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: c.signal,
    }).finally(() => clearTimeout(tid));
    if (!r.ok) return null;
    const data = await r.json();
    const list = Array.isArray(data) ? data : (data.carriers || data.data || []);
    _fxCarriersCache = list;
    _fxCarriersExpiry = Date.now() + 6 * 60 * 60 * 1000; // cache 6 hours
    return list;
  } catch { return null; }
}

// Build offers from active carriers in DB with lane-aware realistic pricing
async function buildOffersFromCarriers(reqBody) {
  // Try live Freightify carriers first; fall back to DB on any error
  let carriers = null;
  try {
    const liveCarriers = await fxGetLiveCarriers();
    if (Array.isArray(liveCarriers) && liveCarriers.length > 10) {
      let dbCarriers = [];
      try {
        const dbResult = await sb('/carriers?active=eq.true&select=code,name,brand_color,logo_url,country,transit_days_avg,services');
        if (Array.isArray(dbResult)) dbCarriers = dbResult;
      } catch {}
      const byCode = new Map();
      for (const c of dbCarriers) {
        if (c && c.code) byCode.set(String(c.code).toUpperCase(), c);
      }
      const palette = ['#003478','#E60012','#003B71','#005EB8','#CC2229','#000000','#FF7900','#0066CC','#1A1F71','#9B0000','#175E3E','#003F87'];
      carriers = liveCarriers.slice(0, 15).map((fc, i) => {
        const codeRaw = fc && (fc.scacCode || fc.code);
        const code = (codeRaw ? String(codeRaw) : `LIVE${i}`).toUpperCase();
        const name = (fc && (fc.scacName || fc.name)) || `Carrier ${code}`;
        const match = byCode.get(code);
        const seed = code.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
        return {
          code, name,
          brand_color: (match && match.brand_color) || palette[seed % palette.length],
          logo_url: (match && match.logo_url) || null,
          country: (match && match.country) || null,
          transit_days_avg: (match && match.transit_days_avg) || null,
          services: (match && match.services) || [],
          priority: match ? Math.max(1, dbCarriers.indexOf(match) + 1) : (i + 5),
        };
      });
    }
  } catch (e) {
    carriers = null;
  }
  // Fallback to local DB if Freightify path didn't produce carriers
  if (!Array.isArray(carriers) || carriers.length === 0) {
    try {
      carriers = await sb('/carriers?active=eq.true&order=priority.asc&limit=12');
    } catch (e) {
      carriers = [];
    }
  }
  if (!Array.isArray(carriers)) carriers = [];
  const ctType = (reqBody.containerType || reqBody.container_type || '40HC').toUpperCase();
  // Market base rates (CN → SA range, mid-2025 spot)
  const baseRates = {
    '20GP': 1450, '20HC': 1550, '40GP': 2650, '40HC': 2750, '40RF': 4200, '45HC': 2950, 'LCL': 75,
  };
  const origin = reqBody.originPort || reqBody.origin_port || 'CNSHA';
  const destination = reqBody.destinationPort || reqBody.destination_port || 'SAJED';
  const baseUSD = baseRates[ctType] || baseRates['40HC'];
  const laneMul = laneMultiplier(origin, destination);
  const transitBase = laneTransitDays(origin, destination);
  const today = new Date();
  const numContainers = parseInt(reqBody.numContainers || reqBody.num_containers || 1) || 1;

  // Deterministic per-carrier variance (so prices don't change wildly on refresh)
  const seed = (origin + destination).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  function det(i, scale) {
    return ((seed * 31 + i * 17) % 100) / 100 * scale;
  }

  const offers = carriers.map((c, i) => {
    // Carrier tier modifier: top-3 charge premium, mid-tier base, lower-tier discount
    const tierMul = c.priority <= 3 ? 1.08 : c.priority <= 8 ? 1.00 : 0.92;
    const variance = det(i, 250) - 125; // ±125 USD deterministic spread
    const price = Math.round((baseUSD * laneMul * tierMul) + variance);
    const transitOffset = (i % 5) - 2; // -2 to +2 day spread
    const transit = Math.max(3, (c.transit_days_avg ? Math.round((c.transit_days_avg + transitBase) / 2) : transitBase) + transitOffset);
    const etdOffset = 3 + (i % 4); // ETD 3-6 days out
    const isDirect = (c.services || []).includes('Direct') || i % 4 === 0;
    return {
      carrier_code: c.code,
      carrier_name: c.name,
      carrier_logo: c.logo_url,
      brand_color: c.brand_color,
      country: c.country,
      route: `${origin} → ${destination}`,
      transit_days: transit,
      price,
      total_price: price * numContainers,
      currency: 'USD',
      validity_until: new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10),
      vessel: `${c.name.split(' ')[0]} ${['Express','Pioneer','Champion','Harmony','Spirit','Voyager','Sovereign','Atlas'][i % 8]}`,
      etd: new Date(today.getTime() + etdOffset * 86400000).toISOString().slice(0, 10),
      eta: new Date(today.getTime() + (etdOffset + transit) * 86400000).toISOString().slice(0, 10),
      service_type: isDirect ? 'Direct' : (i % 3 === 0 ? 'T/S Singapore' : i % 3 === 1 ? 'T/S Jebel Ali' : 'T/S Salalah'),
      free_days: 10 + (i % 5),
      is_direct: isDirect,
    };
  }).filter(o => o.price > 0).sort((a, b) => a.price - b.price);

  return offers;
}

// ── MAIN HANDLER ──
async function webHandler(req) {
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
      status: 'ok', version: '2.14.2', time: new Date().toISOString(),
      services: {
        database: dbStatus, supabase_url: SUPABASE_URL,
        ai: process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : 'none',
        freightify: FREIGHTIFY_API_KEY ? 'configured' : 'not_configured',
        carriers_count: carrierCount,
      },
    });
  }

  // ── Freightify network ping (no auth — pure reachability test) ──
  if (segments[0] === 'freightify' && segments[1] === 'ping' && req.method === 'GET') {
    const result = { base_url: FX_BASE, time: new Date().toISOString(), checks: {} };
    // Test 1: simple GET on base URL with 5s timeout
    try {
      const c = new AbortController();
      const tid = setTimeout(() => c.abort(), 5000);
      const t0 = Date.now();
      const r = await fetch(FX_BASE, {
        method: 'GET',
        headers: { Accept: 'text/html, application/json', 'User-Agent': 'freightlx-ping' },
        signal: c.signal,
      }).finally(() => clearTimeout(tid));
      result.checks.base_reachable = {
        ok: true, status: r.status, duration_ms: Date.now() - t0,
        content_type: r.headers.get('content-type'),
      };
    } catch (e) {
      result.checks.base_reachable = { ok: false, error: e.name === 'AbortError' ? 'timeout_5s' : e.message };
    }
    // Test 2: HEAD on /oauth2/token with 5s timeout
    try {
      const c = new AbortController();
      const tid = setTimeout(() => c.abort(), 5000);
      const t0 = Date.now();
      const r = await fetch(`${FX_BASE}/oauth2/token`, {
        method: 'OPTIONS',
        headers: { Accept: 'application/json', 'User-Agent': 'freightlx-ping' },
        signal: c.signal,
      }).finally(() => clearTimeout(tid));
      result.checks.oauth_endpoint_reachable = {
        ok: true, status: r.status, duration_ms: Date.now() - t0,
      };
    } catch (e) {
      result.checks.oauth_endpoint_reachable = { ok: false, error: e.name === 'AbortError' ? 'timeout_5s' : e.message };
    }
    return json(result);
  }

  // ── Freightify diagnostic (admin or public for debugging) ──
  if (segments[0] === 'freightify' && segments[1] === 'diagnose' && req.method === 'GET') {
    const result = {
      env: {
        has_api_key: !!FREIGHTIFY_API_KEY,
        has_customer_id: !!FREIGHTIFY_CUSTOMER_ID,
        has_client_secret: !!FREIGHTIFY_CLIENT_SECRET,
        has_username: !!FREIGHTIFY_USERNAME,
        has_password: !!FREIGHTIFY_PASSWORD,
        base_url: FX_BASE,
        api_key_len: FREIGHTIFY_API_KEY.length,
        username_hint: FREIGHTIFY_USERNAME ? FREIGHTIFY_USERNAME.replace(/(.{3}).+(@.+)/, '$1***$2') : null,
      },
      checks: {},
    };
    // Step 1: token
    try {
      const t = await fxGetToken(true);
      result.checks.token = { ok: true, length: t.length, prefix: t.slice(0, 24) + '…' };
    } catch (e) {
      result.checks.token = { ok: false, error: e.message };
      return json(result);
    }
    // Step 2: comprehensive probes with short timeouts (must fit in 20s total to avoid Vercel 504)
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const query = `mode=FCL&origin=INNSA&originType=PORT&destination=DEHAM&destinationType=PORT&departureDate=${futureDate}&containers=1X20GPX13000XKG`;

    result.checks.probes = [];
    // Per Freightify docs: BOTH Bearer + x-api-key required together.
    // Test carriers (simple GET, fast) and prices (slow, fans out to carriers)
    const fullAuthHeaders = {
      'x-api-key': FREIGHTIFY_API_KEY,
      Authorization: `Bearer ${_fxToken}`,
      Accept: 'application/json',
      'User-Agent': 'freightlx-platform',
    };
    const endpoints = [
      { name: 'carriers', url: '/v1/carriers', timeout: 5000 },
      { name: 'sea-ports', url: '/v1/sea-ports?countryCode=SA', timeout: 5000 },
      { name: 'prices', url: `/v3/prices?${query}`, timeout: 18000 },
    ];
    for (const ep of endpoints) {
      try {
        const c = new AbortController();
        const tid = setTimeout(() => c.abort(), ep.timeout);
        const t0 = Date.now();
        const r = await fetch(`${FX_BASE}${ep.url}`, {
          headers: fullAuthHeaders, signal: c.signal,
        }).finally(() => clearTimeout(tid));
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        result.checks.probes.push({
          name: ep.name, status: r.status, ok: r.ok, duration_ms: Date.now() - t0,
          reqId: parsed?.reqId || parsed?.requestId || null,
          api_status: parsed?.status || null,
          offers_count: (parsed?.offers || []).length,
          carriers_count: Array.isArray(parsed?.carriers || parsed?.data) ? (parsed?.carriers || parsed?.data).length : null,
          body_preview: text.slice(0, 350),
        });
      } catch (e) {
        result.checks.probes.push({ name: ep.name, error: e.name === 'AbortError' ? `timeout_${ep.timeout/1000}s` : e.message });
      }
    }
    return json(result);
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

        // 1) Try Freightify (now fully normalized by fetchFreightifyRates)
        const fxResult = await fetchFreightifyRates(body);
        let usedSource = fxResult.source;
        let normalized;
        let freightifyDebug = null;

        if (fxResult.offers && fxResult.offers.length > 0) {
          // Sort by price; enrich missing fields via carriers DB
          let cars = [];
          try { cars = await sb('/carriers?active=eq.true&select=code,name,brand_color,logo_url,country'); } catch {}
          const byCode = new Map(cars.map(c => [c.code, c]));
          const byName = new Map(cars.map(c => [c.name.toLowerCase(), c]));
          normalized = fxResult.offers
            .map(o => {
              const c = byCode.get(o.carrier_code) || byName.get((o.carrier_name || '').toLowerCase());
              return {
                ...o,
                carrier_logo: o.carrier_logo || c?.logo_url,
                brand_color: o.brand_color || c?.brand_color,
                country: o.country || c?.country,
              };
            })
            .filter(o => o.price > 0)
            .sort((a, b) => a.price - b.price);
        } else {
          // Freightify-only mode: no fallback. Return empty offers with diagnostic info.
          normalized = [];
          usedSource = fxResult.source || 'freightify_no_offers';
          freightifyDebug = { reason: fxResult.source, error: fxResult.error, trace: fxResult.trace };
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
          // Only set carrier_code if it exists in our DB (FK constraint).
          // For Freightify-only carriers, save the name but leave code null.
          let knownCarrierCodes = new Set();
          try {
            const codeRows = await sb('/carriers?select=code');
            knownCarrierCodes = new Set((codeRows || []).map(c => String(c.code).toUpperCase()));
          } catch {}
          await sb('/rate_offers', { method: 'POST', body: normalized.map(o => ({
            id: genId('OFR'), request_id: requestId,
            carrier_code: (o.carrier_code && knownCarrierCodes.has(String(o.carrier_code).toUpperCase())) ? o.carrier_code : null,
            carrier_name: o.carrier_name,
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
          // Async polling info: UI uses these to keep polling for more offers
          freightify_req_id: fxResult.reqId || null,
          in_progress: !!fxResult.in_progress,
          api_status: fxResult.api_status || null,
          ...(freightifyDebug ? { freightify_fallback_reason: freightifyDebug } : {}),
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

      // ── Async polling: GET /rates/poll/{reqId} — single quick call to Freightify
      if (segments[1] === 'poll' && segments[2] && req.method === 'GET') {
        const reqId = segments[2];
        try {
          const token = await fxGetToken();
          const c = new AbortController();
          const tid = setTimeout(() => c.abort(), 18000);
          const r = await fetch(`${FX_BASE}/v3/prices/${reqId}?offset=0&limit=30`, {
            headers: {
              'x-api-key': FREIGHTIFY_API_KEY,
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            signal: c.signal,
          }).finally(() => clearTimeout(tid));
          const text = await r.text();
          let data = null;
          try { data = JSON.parse(text); } catch {}
          const offers = data?.offers || data?.data?.offers || [];
          const status = data?.status || data?.data?.status || 'UNKNOWN';
          const fallbackRoute = '';
          const normalized = Array.isArray(offers)
            ? offers.map(o => fxNormalizeOffer(o, fallbackRoute)).filter(o => o.price > 0).sort((a,b) => a.price - b.price)
            : [];
          return json({
            reqId, status,
            offers: normalized, total: normalized.length,
            completed: status === 'COMPLETED' || normalized.length >= 5,
            httpStatus: r.status,
          });
        } catch (e) {
          return json({ reqId: segments[2], error: e.message, completed: false }, 200);
        }
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
      if (req.method === 'GET' && segments[1] && !segments[2]) {
        const [s] = await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}&select=*&limit=1`);
        if (!s) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json(s);
      }
      if (req.method === 'POST' && !segments[1]) {
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
      if (req.method === 'PATCH' && segments[1] && !segments[2]) {
        const body = await req.json();
        const [s] = await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'PATCH', body });
        if (!s) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json(s);
      }
      if (req.method === 'DELETE' && segments[1] && !segments[2]) {
        await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'DELETE' });
        return json({ ok: true });
      }
      // ── Shipment tracking: history of status events ──
      if (req.method === 'GET' && segments[1] && segments[2] === 'tracking') {
        const [s] = await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}&select=*&limit=1`);
        if (!s) return json({ error: { code: 'NOT_FOUND' } }, 404);
        let events = [];
        try {
          events = await sb(`/shipment_events?shipment_id=eq.${segments[1]}&order=event_at.desc&select=*`);
        } catch {}
        // Synthesize default events from shipment lifecycle if no events table
        if (!Array.isArray(events) || events.length === 0) {
          events = [
            { event_at: s.created_at || new Date().toISOString(), status: 'created', label: 'تم إنشاء الشحنة' },
            ...(s.status === 'transit' || s.status === 'delivered' ? [{ event_at: s.created_at, status: 'picked_up', label: 'تم استلام البضاعة' }] : []),
            ...(s.status === 'transit' ? [{ event_at: new Date().toISOString(), status: 'in_transit', label: 'في عرض البحر' }] : []),
            ...(s.status === 'delivered' ? [{ event_at: s.delivered_at || new Date().toISOString(), status: 'delivered', label: 'تم التسليم' }] : []),
          ];
        }
        return json({ shipment: s, events, total: events.length });
      }
      // ── POST /shipments/{id}/status — update status with notification ──
      if (req.method === 'POST' && segments[1] && segments[2] === 'status') {
        const body = await req.json();
        const newStatus = body.status;
        const statusTexts = {
          pending: 'قيد الموافقة', active: 'في التخليص', transit: 'في عرض البحر',
          delivered: 'تم التسليم', cancelled: 'تم الإلغاء',
        };
        const patch = {
          status: newStatus,
          status_text: body.status_text || statusTexts[newStatus] || newStatus,
        };
        if (newStatus === 'delivered') patch.delivered_at = new Date().toISOString();
        const [s] = await sb(`/shipments?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'PATCH', body: patch });
        if (!s) return json({ error: { code: 'NOT_FOUND' } }, 404);
        await sb('/notifications', { method: 'POST', body: [{
          user_id: user.id, type: 'info',
          text: `الشحنة <strong>${s.id}</strong> الآن: ${patch.status_text}`,
        }], prefer: 'return=minimal' });
        return json(s);
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
      if (req.method === 'POST' && segments[1] && segments[2] === 'book') {
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
    if (segments[0] === 'documents') {
      if (req.method === 'GET' && !segments[1]) {
        const shipmentId = url.searchParams.get('shipment_id');
        let q = `/documents?user_id=eq.${user.id}&select=*&order=created_at.desc`;
        if (shipmentId) q += `&shipment_id=eq.${shipmentId}`;
        const data = await sb(q);
        return json({ data, total: data.length, page: 1, limit: data.length });
      }
      if (req.method === 'GET' && segments[1]) {
        const [doc] = await sb(`/documents?id=eq.${segments[1]}&user_id=eq.${user.id}&select=*&limit=1`);
        if (!doc) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json(doc);
      }
      // POST /documents — metadata only (file URL comes from Supabase Storage)
      if (req.method === 'POST' && !segments[1]) {
        const body = await req.json();
        const [doc] = await sb('/documents', { method: 'POST', body: [{
          id: body.id || genId('DOC'),
          user_id: user.id,
          shipment_id: body.shipment_id || null,
          name: body.name || 'مستند',
          file_url: body.file_url,
          file_type: body.file_type || 'other',
          file_size_kb: body.file_size_kb || null,
          mime_type: body.mime_type || null,
          description: body.description || null,
        }]});
        await sb('/notifications', { method: 'POST', body: [{
          user_id: user.id, type: 'success',
          text: `تم رفع مستند <strong>${doc.name}</strong>`,
        }], prefer: 'return=minimal' });
        return json(doc, 201);
      }
      if (req.method === 'PATCH' && segments[1]) {
        const body = await req.json();
        const [doc] = await sb(`/documents?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'PATCH', body });
        if (!doc) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json(doc);
      }
      if (req.method === 'DELETE' && segments[1]) {
        await sb(`/documents?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'DELETE' });
        return json({ ok: true });
      }
    }

    // ─── NOTIFICATIONS ───
    if (segments[0] === 'notifications') {
      if (req.method === 'GET' && !segments[1]) {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const data = await sb(`/notifications?user_id=eq.${user.id}&select=*&order=created_at.desc&limit=${limit}`);
        const unread = data.filter(n => !n.read).length;
        return json({ data, unread, total: data.length });
      }
      if (req.method === 'POST' && segments[1] === 'mark-read') {
        await sb(`/notifications?user_id=eq.${user.id}&read=eq.false`, {
          method: 'PATCH', body: { read: true }, prefer: 'return=minimal',
        });
        return json({ ok: true });
      }
      if (req.method === 'PATCH' && segments[1] && segments[2] === 'read') {
        await sb(`/notifications?id=eq.${segments[1]}&user_id=eq.${user.id}`, {
          method: 'PATCH', body: { read: true }, prefer: 'return=minimal',
        });
        return json({ ok: true });
      }
      if (req.method === 'DELETE' && segments[1]) {
        await sb(`/notifications?id=eq.${segments[1]}&user_id=eq.${user.id}`, { method: 'DELETE' });
        return json({ ok: true });
      }
      if (req.method === 'DELETE' && !segments[1]) {
        // Clear all read notifications
        await sb(`/notifications?user_id=eq.${user.id}&read=eq.true`, { method: 'DELETE' });
        return json({ ok: true });
      }
    }

    // ─── SEARCH ─── (across user resources)
    if (segments[0] === 'search' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q || q.length < 2) return json({ results: [], total: 0 });
      // PostgREST ilike uses * as wildcard, not %
      const qLike = `*${q}*`;
      const [shipments, quotes, invoices] = await Promise.all([
        sb(`/shipments?user_id=eq.${user.id}&or=(id.ilike.${qLike},origin.ilike.${qLike},destination.ilike.${qLike},carrier.ilike.${qLike})&select=*&limit=10`).catch(() => []),
        sb(`/quotes?user_id=eq.${user.id}&or=(id.ilike.${qLike},origin.ilike.${qLike},destination.ilike.${qLike},carrier.ilike.${qLike})&select=*&limit=10`).catch(() => []),
        sb(`/invoices?user_id=eq.${user.id}&or=(id.ilike.${qLike},description.ilike.${qLike})&select=*&limit=10`).catch(() => []),
      ]);
      const results = [
        ...shipments.map(s => ({ ...s, type: 'shipment', link: `/shipments/${s.id}` })),
        ...quotes.map(s => ({ ...s, type: 'quote', link: `/quotes/${s.id}` })),
        ...invoices.map(s => ({ ...s, type: 'invoice', link: `/invoices/${s.id}` })),
      ];
      return json({ results, total: results.length, query: q });
    }

    // ─── REPORTS ─── (per-user reports)
    if (segments[0] === 'reports' && req.method === 'GET') {
      // GET /reports/monthly?year=2026&month=5
      if (segments[1] === 'monthly') {
        const year = parseInt(url.searchParams.get('year') || new Date().getFullYear());
        const month = parseInt(url.searchParams.get('month') || (new Date().getMonth() + 1));
        const start = new Date(year, month - 1, 1).toISOString();
        const end = new Date(year, month, 0, 23, 59, 59).toISOString();
        const [shipments, invoices, quotes] = await Promise.all([
          sb(`/shipments?user_id=eq.${user.id}&created_at=gte.${start}&created_at=lte.${end}&select=*`),
          sb(`/invoices?user_id=eq.${user.id}&created_at=gte.${start}&created_at=lte.${end}&select=*`),
          sb(`/quotes?user_id=eq.${user.id}&created_at=gte.${start}&created_at=lte.${end}&select=*`),
        ]);
        const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
        const pendingAmount = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + Number(i.amount), 0);
        const carrierBreakdown = {};
        shipments.forEach(s => { carrierBreakdown[s.carrier] = (carrierBreakdown[s.carrier] || 0) + 1; });
        const lanesBreakdown = {};
        shipments.forEach(s => {
          const lane = `${s.origin} → ${s.destination}`;
          lanesBreakdown[lane] = (lanesBreakdown[lane] || 0) + 1;
        });
        return json({
          period: { year, month, start, end },
          totals: {
            shipments: shipments.length, quotes: quotes.length,
            invoices: invoices.length, revenue: totalRevenue, pending: pendingAmount,
          },
          breakdown: {
            by_carrier: Object.entries(carrierBreakdown).map(([k, v]) => ({ carrier: k, count: v })).sort((a, b) => b.count - a.count),
            by_lane: Object.entries(lanesBreakdown).map(([k, v]) => ({ lane: k, count: v })).sort((a, b) => b.count - a.count).slice(0, 10),
            by_status: ['pending','active','transit','delivered','cancelled'].map(st => ({
              status: st, count: shipments.filter(s => s.status === st).length,
            })),
          },
          recent_shipments: shipments.slice(0, 5),
        });
      }
      // GET /reports/dashboard — last 30 days summary
      if (segments[1] === 'dashboard') {
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        const [shipments, invoices, quotes, notifications] = await Promise.all([
          sb(`/shipments?user_id=eq.${user.id}&created_at=gte.${since}&select=status,price,created_at&order=created_at.desc`),
          sb(`/invoices?user_id=eq.${user.id}&created_at=gte.${since}&select=status,amount,created_at`),
          sb(`/quotes?user_id=eq.${user.id}&created_at=gte.${since}&select=status`),
          sb(`/notifications?user_id=eq.${user.id}&read=eq.false&select=id`),
        ]);
        return json({
          period: 'last_30_days',
          totals: {
            shipments_30d: shipments.length,
            active_shipments: shipments.filter(s => ['active','transit','pending'].includes(s.status)).length,
            delivered_shipments: shipments.filter(s => s.status === 'delivered').length,
            revenue_30d: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0),
            pending_invoices: invoices.filter(i => i.status === 'pending').length,
            quotes_30d: quotes.length,
            unread_notifications: notifications.length,
          },
        });
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
      // PATCH /admin/users/{id} — update role/status
      if (segments[1] === 'users' && segments[2] && req.method === 'PATCH') {
        const body = await req.json();
        const patch = {};
        if (body.role) patch.role = body.role;
        if (body.status) patch.status = body.status;
        if (body.full_name) patch.full_name = body.full_name;
        const [u] = await sb(`/profiles?id=eq.${segments[2]}`, { method: 'PATCH', body: patch });
        if (!u) return json({ error: { code: 'NOT_FOUND' } }, 404);
        return json(u);
      }
      // GET /admin/analytics — comprehensive analytics for admin dashboard
      if (segments[1] === 'analytics' && req.method === 'GET') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const [allShipments, allInvoices, allProfiles, allRateReqs] = await Promise.all([
          sb('/shipments?select=*&order=created_at.desc&limit=500'),
          sb('/invoices?select=*'),
          sb('/profiles?select=id,status,created_at'),
          sb(`/rate_requests?created_at=gte.${since}&select=*&order=created_at.desc&limit=200`),
        ]);
        // Revenue by month (last 12 months)
        const revenueByMonth = {};
        allInvoices.filter(i => i.status === 'paid').forEach(i => {
          const month = (i.paid_at || i.created_at || '').slice(0, 7);
          if (!month) return;
          revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(i.amount);
        });
        // Top carriers by shipment count
        const carrierCounts = {};
        allShipments.forEach(s => { carrierCounts[s.carrier] = (carrierCounts[s.carrier] || 0) + 1; });
        const topCarriers = Object.entries(carrierCounts).map(([k, v]) => ({ carrier: k, count: v })).sort((a, b) => b.count - a.count).slice(0, 10);
        // Top lanes
        const laneCounts = {};
        allShipments.forEach(s => {
          const lane = `${s.origin} → ${s.destination}`;
          laneCounts[lane] = (laneCounts[lane] || 0) + 1;
        });
        const topLanes = Object.entries(laneCounts).map(([k, v]) => ({ lane: k, count: v })).sort((a, b) => b.count - a.count).slice(0, 10);
        // User growth (signups per month)
        const userGrowth = {};
        allProfiles.forEach(p => {
          const month = (p.created_at || '').slice(0, 7);
          if (!month) return;
          userGrowth[month] = (userGrowth[month] || 0) + 1;
        });
        return json({
          period_days: days,
          revenue_total: allInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0),
          revenue_pending: allInvoices.filter(i => i.status === 'pending').reduce((s, i) => s + Number(i.amount), 0),
          revenue_by_month: Object.entries(revenueByMonth).map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month)),
          top_carriers: topCarriers,
          top_lanes: topLanes,
          user_growth: Object.entries(userGrowth).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
          rate_requests_recent: allRateReqs.length,
          rate_request_freightify_success: allRateReqs.filter(r => r.source === 'freightify').length,
          rate_request_fallback: allRateReqs.filter(r => r.source !== 'freightify').length,
          shipments_by_status: {
            pending: allShipments.filter(s => s.status === 'pending').length,
            active: allShipments.filter(s => s.status === 'active').length,
            transit: allShipments.filter(s => s.status === 'transit').length,
            delivered: allShipments.filter(s => s.status === 'delivered').length,
            cancelled: allShipments.filter(s => s.status === 'cancelled').length,
          },
        });
      }
      // GET /admin/recent-activity
      if (segments[1] === 'recent-activity' && req.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const [shipments, invoices, rateReqs, profiles] = await Promise.all([
          sb(`/shipments?select=id,user_id,carrier,origin,destination,status,created_at&order=created_at.desc&limit=${limit}`),
          sb(`/invoices?select=id,user_id,amount,status,created_at&order=created_at.desc&limit=${limit}`),
          sb(`/rate_requests?select=id,user_id,origin_port,destination_port,source,created_at&order=created_at.desc&limit=${limit}`),
          sb(`/profiles?select=id,email,created_at&order=created_at.desc&limit=${limit}`),
        ]);
        const events = [
          ...shipments.map(s => ({ type: 'shipment', timestamp: s.created_at, data: s, label: `شحنة ${s.id}` })),
          ...invoices.map(i => ({ type: 'invoice', timestamp: i.created_at, data: i, label: `فاتورة $${i.amount}` })),
          ...rateReqs.map(r => ({ type: 'rate_request', timestamp: r.created_at, data: r, label: `بحث أسعار ${r.origin_port}→${r.destination_port}` })),
          ...profiles.map(p => ({ type: 'user_signup', timestamp: p.created_at, data: p, label: `تسجيل ${p.email}` })),
        ].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        return json({ events: events.slice(0, limit), total: events.length });
      }
      // GET /admin/freightify-status
      if (segments[1] === 'freightify-status' && req.method === 'GET') {
        const recent = await sb('/rate_requests?select=source,duration_ms,created_at&order=created_at.desc&limit=50');
        const successCount = recent.filter(r => r.source === 'freightify').length;
        const avgDuration = recent.length > 0 ? Math.round(recent.reduce((s, r) => s + (r.duration_ms || 0), 0) / recent.length) : 0;
        return json({
          recent_requests: recent.length,
          freightify_success_rate: recent.length > 0 ? ((successCount / recent.length) * 100).toFixed(1) + '%' : 'N/A',
          avg_duration_ms: avgDuration,
          last_request_at: recent[0]?.created_at || null,
          sources_breakdown: recent.reduce((acc, r) => { acc[r.source] = (acc[r.source] || 0) + 1; return acc; }, {}),
        });
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

// Vercel Pro + Fluid Compute on Node.js runtime — 60s max duration.
// Wraps the Web Standard handler (Request -> Response) for Node.js (req, res) style.
export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function nodeHandler(req, res) {
  try {
    // Build full URL from Node.js req
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'freightlx-ai.vercel.app';
    const url = `${proto}://${host}${req.url}`;

    // Convert headers to Web Headers
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach(vv => headers.append(k, vv));
      else if (v !== undefined) headers.set(k, String(v));
    }

    // Build Web Request
    const init = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      if (chunks.length > 0) init.body = Buffer.concat(chunks);
    }
    const webReq = new Request(url, init);

    // Call existing web handler
    const webRes = await webHandler(webReq);

    // Mirror to Node res
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => {
      try { res.setHeader(key, value); } catch {}
    });
    const body = await webRes.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'WRAPPER_ERROR', message: err.message, stack: err.stack?.slice(0, 500) } }));
  }
}
