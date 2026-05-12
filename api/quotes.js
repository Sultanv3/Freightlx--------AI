/**
 * FREIGHTLX Quotes - Freightify Real-Time Integration
 * Tries multiple base URLs, auth strategies, and endpoint patterns.
 */

// Possible Freightify base URLs (we try them all)
const BASE_URLS = [
  process.env.FREIGHTIFY_BASE_URL,
  'https://api.freightify.com',
  'https://app.freightify.com/api',
  'https://platform.freightify.com/api',
  'https://api.freightify.io'
].filter(Boolean);

const AUTH_PATHS = [
  '/v1/auth/token',
  '/auth/token',
  '/oauth/token',
  '/api/v1/auth/token',
  '/api/auth/login',
  '/login'
];

const RATE_PATHS = [
  '/v1/rates/search',
  '/api/v1/rates/search',
  '/rates/search',
  '/api/rates/search',
  '/v1/spot-rates/search',
  '/v1/offers',
  '/v2/rates/search',
  '/api/v1/spot/search'
];

// Token cache
let tokenCache = null;
let tokenExpiry = 0;
let workingBase = null;
let workingRatePath = null;

async function tryAuth(baseUrl) {
  const customerId = process.env.FREIGHTIFY_CUSTOMER_ID;
  const clientSecret = process.env.FREIGHTIFY_CLIENT_SECRET;
  const apiKey = process.env.FREIGHTIFY_API_KEY;

  const variations = [
    { customer_id: customerId, client_secret: clientSecret, grant_type: 'client_credentials' },
    { customerId, clientSecret, grantType: 'client_credentials' },
    { client_id: customerId, client_secret: clientSecret },
    { customer_id: customerId, secret: clientSecret },
    { api_key: apiKey, customer_id: customerId },
    { username: customerId, password: clientSecret }
  ];

  for (const path of AUTH_PATHS) {
    for (const body of variations) {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': apiKey,
            'apikey': apiKey
          },
          body: JSON.stringify(body)
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        if (!data) continue;
        const token = data.access_token || data.accessToken || data.token || data.jwt || data.id_token;
        if (token) {
          const expires = data.expires_in || data.expiresIn || 3600;
          return { token, expiresIn: expires, base: baseUrl, path };
        }
      } catch {}
    }
  }
  return null;
}

async function searchRatesTry(baseUrl, path, body, token) {
  const apiKey = process.env.FREIGHTIFY_API_KEY;
  const customerId = process.env.FREIGHTIFY_CUSTOMER_ID;

  const payloadVariations = [
    {
      originPortCode: body.originPort,
      destinationPortCode: body.destinationPort,
      containerType: body.containerType,
      commodityCode: body.commodityCode || '8517',
      cargoReadyDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    },
    {
      pol: body.originPort,
      pod: body.destinationPort,
      equipmentType: body.containerType,
      commodity: body.commodityCode || '8517'
    },
    {
      origin: body.originPort,
      destination: body.destinationPort,
      container: body.containerType,
      hs_code: body.commodityCode || '8517'
    }
  ];

  for (const payload of payloadVariations) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': apiKey,
        'apikey': apiKey
      };
      if (customerId) headers['X-Customer-Id'] = customerId;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (!data) continue;
      const offers = data.rates || data.offers || data.results || data.data || data.spotRates || (Array.isArray(data) ? data : null);
      if (Array.isArray(offers) && offers.length > 0) return { offers, base: baseUrl, path };
    } catch {}

    // Also try GET with query params
    try {
      const url = new URL(`${baseUrl}${path}`);
      Object.entries(payload).forEach(([k, v]) => url.searchParams.append(k, v));
      const headers = {
        'Accept': 'application/json',
        'X-API-Key': apiKey,
        'apikey': apiKey
      };
      if (customerId) headers['X-Customer-Id'] = customerId;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (!data) continue;
      const offers = data.rates || data.offers || data.results || data.data || (Array.isArray(data) ? data : null);
      if (Array.isArray(offers) && offers.length > 0) return { offers, base: baseUrl, path };
    } catch {}
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
    validity: (r.validityTo || r.validUntil || r.validity || '').toString().slice(0, 10) || 'N/A',
    vessel: r.vesselName || r.vessel || `${r.carrierName || 'Vessel'} EXP`,
    etd: (r.etd || '').toString().slice(0, 10),
    eta: (r.eta || '').toString().slice(0, 10),
    services: r.routingType || (r.transhipment ? 'T/S' : 'Direct'),
    freeDays: r.freeDaysAtDestination || r.freeDays || 10
  })).filter(o => o.price > 0).sort((a, b) => a.price - b.price);
}

function generateMockOffers(body) {
  const baseRates = {
    '20GP': { base: 1500, days: 22 },
    '40GP': { base: 2800, days: 22 },
    '40HC': { base: 2900, days: 22 },
    '40RF': { base: 4500, days: 22 },
    'LCL':  { base: 80, days: 28 }
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
  return carriers.map((c, i) => ({
    carrier: c.name,
    carrierLogo: '🚢',
    route: `${body.originPort || 'POL'} → ${body.destinationPort || 'POD'}`,
    transitTime: route.days + Math.floor(Math.random() * 6) - 3,
    price: route.base + c.delta + Math.floor(Math.random() * 100),
    currency: 'USD',
    containerType: body.containerType || '40HC',
    validity: new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10),
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
  try { body = await req.json(); } catch {}

  const debug = {
    hasApiKey: !!process.env.FREIGHTIFY_API_KEY,
    hasCustomerId: !!process.env.FREIGHTIFY_CUSTOMER_ID,
    hasClientSecret: !!process.env.FREIGHTIFY_CLIENT_SECRET,
    apiKeyLength: process.env.FREIGHTIFY_API_KEY?.length || 0,
    triedBases: [],
    authResult: null,
    rateSearchResult: null
  };

  let offers = null;

  if (process.env.FREIGHTIFY_API_KEY) {
    // Use cached working endpoint if available
    if (workingBase && workingRatePath && tokenCache && Date.now() < tokenExpiry) {
      try {
        const result = await searchRatesTry(workingBase, workingRatePath, body, tokenCache);
        if (result) offers = normalizeOffers(result.offers, body);
      } catch {}
    }

    // Try all combinations if no cache or cache failed
    if (!offers) {
      outer: for (const base of BASE_URLS) {
        debug.triedBases.push(base);

        // First try: API key only (no OAuth)
        for (const path of RATE_PATHS) {
          const result = await searchRatesTry(base, path, body, null);
          if (result) {
            offers = normalizeOffers(result.offers, body);
            workingBase = base;
            workingRatePath = path;
            debug.rateSearchResult = `${base}${path} (api-key-only)`;
            break outer;
          }
        }

        // Then try with OAuth token
        const authResult = await tryAuth(base);
        if (authResult) {
          debug.authResult = `${authResult.base}${authResult.path}`;
          tokenCache = authResult.token;
          tokenExpiry = Date.now() + (authResult.expiresIn * 1000);

          for (const path of RATE_PATHS) {
            const result = await searchRatesTry(base, path, body, authResult.token);
            if (result) {
              offers = normalizeOffers(result.offers, body);
              workingBase = base;
              workingRatePath = path;
              debug.rateSearchResult = `${base}${path} (oauth)`;
              break outer;
            }
          }
        }
      }
    }
  }

  const isReal = offers && offers.length > 0;
  if (!isReal) {
    offers = generateMockOffers(body);
  }

  return new Response(JSON.stringify({
    offers,
    source: isReal ? 'freightify' : 'mock',
    mock: !isReal,
    debug
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
