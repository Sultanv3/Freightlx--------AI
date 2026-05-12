/**
 * FREIGHTLX Real-Time Quotes API - Freightify Integration
 *
 * Required env vars (set in Vercel → Settings → Environment Variables):
 *   FREIGHTIFY_CUSTOMER_ID   : Customer ID (e.g. d306d42d-...)
 *   FREIGHTIFY_CLIENT_SECRET : Client Secret
 *   FREIGHTIFY_API_KEY       : API Key
 *   FREIGHTIFY_BASE_URL      : (optional) e.g. https://api.freightify.com
 *
 * Auth flow:
 *   1) POST {BASE}/v1/auth/token with customer_id + client_secret → access token
 *   2) Cache token (in-memory, edge runtime resets often)
 *   3) Search rates using access token + API key
 *
 * Returns standardized offer list.
 */

const FREIGHTIFY_BASE = process.env.FREIGHTIFY_BASE_URL || 'https://api.freightify.com';

// Token cache (Edge runtime cold-starts often, but caches help within a single instance)
let tokenCache = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const customerId = process.env.FREIGHTIFY_CUSTOMER_ID;
  const clientSecret = process.env.FREIGHTIFY_CLIENT_SECRET;
  if (!customerId || !clientSecret) return null;

  const now = Date.now();
  if (tokenCache && now < tokenExpiry - 60_000) return tokenCache;

  // Try common auth endpoints in order
  const authPaths = [
    '/v1/auth/token',
    '/api/auth/token',
    '/oauth/token',
    '/auth/login'
  ];

  for (const path of authPaths) {
    try {
      const res = await fetch(`${FREIGHTIFY_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          customer_id: customerId,
          customerId,
          client_id: customerId,
          client_secret: clientSecret,
          clientSecret,
          grant_type: 'client_credentials'
        })
      });

      if (!res.ok) continue;
      const data = await res.json();
      const token = data.access_token || data.accessToken || data.token || data.jwt;
      if (!token) continue;
      const expiresIn = data.expires_in || data.expiresIn || 3600;
      tokenCache = token;
      tokenExpiry = now + expiresIn * 1000;
      console.log('[Freightify] Auth success via', path);
      return token;
    } catch (err) {
      console.error('[Freightify] Auth attempt failed', path, err.message);
      continue;
    }
  }

  return null;
}

async function searchRates(body, accessToken) {
  const apiKey = process.env.FREIGHTIFY_API_KEY;
  const customerId = process.env.FREIGHTIFY_CUSTOMER_ID;

  const searchBody = {
    originPortCode: body.originPort,
    destinationPortCode: body.destinationPort,
    pol: body.originPort,
    pod: body.destinationPort,
    origin: body.originPort,
    destination: body.destinationPort,
    containerType: body.containerType || '40HC',
    equipmentType: body.containerType || '40HC',
    commodityCode: body.commodityCode || '8517',
    commodity: body.commodityCode || '8517',
    cargoWeight: body.cargoWeight || 18000,
    cargoVolume: body.cargoVolume || 60,
    cargoReadyDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    incoterm: body.incoterm || 'FOB',
    transportMode: 'FCL'
  };

  // Try common rate-search endpoints
  const searchPaths = [
    '/v1/rates/search',
    '/api/rates/search',
    '/v1/offers/search',
    '/rates/spot/search'
  ];

  const baseHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-API-Key': apiKey,
    'apikey': apiKey,
    'X-Customer-Id': customerId
  };
  if (accessToken) {
    baseHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  for (const path of searchPaths) {
    try {
      const res = await fetch(`${FREIGHTIFY_BASE}${path}`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(searchBody)
      });
      if (!res.ok) {
        console.error('[Freightify] Search', path, res.status);
        continue;
      }
      const data = await res.json();
      const rawOffers = data.rates || data.offers || data.results || data.data || data.spotRates || [];
      if (!Array.isArray(rawOffers) || rawOffers.length === 0) continue;
      return normalizeOffers(rawOffers, body);
    } catch (err) {
      console.error('[Freightify] Search error', path, err.message);
      continue;
    }
  }
  return null;
}

function normalizeOffers(rawOffers, body) {
  return rawOffers.map(r => ({
    carrier: r.carrierName || r.carrier || r.shippingLine || r.carrierShortName || 'Carrier',
    carrierLogo: '🚢',
    route: `${r.originPortCode || body.originPort} → ${r.destinationPortCode || body.destinationPort}`,
    transitTime: r.transitTime || r.transit_days || r.tt || 25,
    price: parseFloat(r.totalPrice || r.price || r.amount || r.netRate || r.allInRate || 0),
    currency: r.currency || r.totalCurrency || 'USD',
    containerType: r.equipmentType || r.containerType || body.containerType,
    validity: (r.validityTo || r.validUntil || r.validity || '').slice(0, 10) || 'N/A',
    vessel: r.vesselName || r.vessel || `${r.carrierName || 'Vessel'} EXP`,
    etd: (r.etd || '').slice(0, 10),
    eta: (r.eta || '').slice(0, 10),
    services: r.routingType || (r.transhipment ? 'T/S' : 'Direct'),
    freeDays: r.freeDaysAtDestination || r.freeDays || 10
  })).filter(o => o.price > 0).sort((a, b) => a.price - b.price);
}

function generateMockOffers(body) {
  const baseRates = {
    '20GP': { min: 1500, max: 2800, days: 22 },
    '40GP': { min: 2800, max: 4200, days: 22 },
    '40HC': { min: 2900, max: 4500, days: 22 },
    '40RF': { min: 4500, max: 7000, days: 22 },
    'LCL':  { min: 80, max: 180, days: 28 }
  };
  const route = baseRates[body.containerType] || baseRates['40HC'];
  const carriers = [
    { name: 'HMM', delta: 0 },
    { name: 'COSCO', delta: 80 },
    { name: 'MSC', delta: 150 },
    { name: 'Maersk', delta: 220 },
    { name: 'ONE', delta: 300 },
    { name: 'CMA CGM', delta: 380 },
    { name: 'Hapag-Lloyd', delta: 450 },
    { name: 'Yang Ming', delta: 520 }
  ];
  const today = new Date();
  const validUntil = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  return carriers.map((c, i) => ({
    carrier: c.name,
    carrierLogo: '🚢',
    route: `${body.originPort || 'POL'} → ${body.destinationPort || 'POD'}`,
    transitTime: route.days + Math.floor(Math.random() * 6) - 3,
    price: route.min + c.delta + Math.floor(Math.random() * 100),
    currency: 'USD',
    containerType: body.containerType || '40HC',
    validity: validUntil,
    vessel: `${c.name} ${['CHAMPION', 'HARMONY', 'EXPRESS', 'STAR', 'PIONEER'][i % 5]}`,
    etd: new Date(today.getTime() + (3 + i) * 86400000).toISOString().slice(0, 10),
    eta: new Date(today.getTime() + (3 + i + route.days) * 86400000).toISOString().slice(0, 10),
    services: ['Direct', 'T/S Singapore', 'T/S Colombo'][i % 3],
    freeDays: 10 + (i % 5)
  })).sort((a, b) => a.price - b.price);
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {}

  // Try real Freightify API
  let offers = null;
  let source = 'mock';
  let authStatus = 'no-credentials';

  if (process.env.FREIGHTIFY_API_KEY) {
    try {
      const token = await getAccessToken();
      authStatus = token ? 'token-obtained' : 'no-token';
      offers = await searchRates(body, token);
      if (offers && offers.length) source = 'freightify';
    } catch (err) {
      console.error('[Freightify] Top-level error:', err);
    }
  }

  if (!offers || !offers.length) {
    offers = generateMockOffers(body);
  }

  return new Response(JSON.stringify({
    offers,
    source,
    mock: source !== 'freightify',
    authStatus,
    requestEcho: body
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
    }
  });
}

export const config = {
  runtime: 'edge'
};
