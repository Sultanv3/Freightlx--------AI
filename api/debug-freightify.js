/**
 * Diagnostic endpoint v2 - Discover Freightify's actual API
 * Visit: /api/debug-freightify
 *
 * Improvements vs v1:
 *  - Adds realistic User-Agent so CloudFront/WAF doesn't reject us
 *  - Probes 12 candidate subdomains (link, link-api, rates, b2b, etc.)
 *  - Tries Authorization Basic + Bearer + custom header combos
 *  - Captures response headers so we can see WAF/CDN info
 */

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req) {
  const apiKey = process.env.FREIGHTIFY_API_KEY;
  const customerId = process.env.FREIGHTIFY_CUSTOMER_ID;
  const clientSecret = process.env.FREIGHTIFY_CLIENT_SECRET;

  // Many candidate base URLs - Freightify product is called "LINK"
  const baseUrls = [
    'https://api.freightify.com',
    'https://link.freightify.com',
    'https://link-api.freightify.com',
    'https://rates.freightify.com',
    'https://rates-api.freightify.com',
    'https://b2b.freightify.com',
    'https://b2b-api.freightify.com',
    'https://gateway.freightify.com',
    'https://partner.freightify.com',
    'https://partner-api.freightify.com',
    'https://sandbox.freightify.com',
    'https://sandbox-api.freightify.com',
    'https://api-sandbox.freightify.com',
    'https://carrier.freightify.com',
    'https://my.freightify.com'
  ];

  const probePaths = [
    '/',
    '/v1',
    '/api/v1',
    '/v1/health',
    '/v1/ping',
    '/v1/spot/search',
    '/v1/spot-rates/search',
    '/v1/rates/spot',
    '/v1/rates/search',
    '/v1/quotation/search',
    '/v1/schedules/search',
    '/api/v1/spot-rates/search',
    '/swagger.json',
    '/swagger/v1/swagger.json',
    '/v2/api-docs',
    '/openapi.json',
    '/api-docs'
  ];

  // Auth header strategies - try every common pattern
  function authHeaders(strategy) {
    const basic = btoa(`${customerId}:${clientSecret}`);
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    };
    switch (strategy) {
      case 'bearer-apikey':
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'basic':
        headers['Authorization'] = `Basic ${basic}`;
        break;
      case 'x-api-key':
        headers['X-API-Key'] = apiKey;
        headers['X-Customer-Id'] = customerId;
        break;
      case 'apikey':
        headers['apikey'] = apiKey;
        headers['x-customer-id'] = customerId;
        break;
      case 'freightify':
        headers['freightify-api-key'] = apiKey;
        headers['freightify-customer-id'] = customerId;
        break;
      case 'all':
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['X-API-Key'] = apiKey;
        headers['apikey'] = apiKey;
        headers['X-Customer-Id'] = customerId;
        headers['freightify-api-key'] = apiKey;
        break;
    }
    return headers;
  }

  const results = [];
  const strategies = ['x-api-key', 'bearer-apikey', 'basic', 'apikey', 'freightify', 'all'];

  // Phase 1: GET probes — find any base URL that doesn't 403
  for (const base of baseUrls) {
    for (const path of probePaths) {
      const url = `${base}${path}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, {
          method: 'GET',
          headers: authHeaders('all'),
          signal: controller.signal
        });
        clearTimeout(timeout);
        const status = res.status;
        if (status === 404) continue;
        const contentType = res.headers.get('content-type') || '';
        const server = res.headers.get('server') || '';
        const xCache = res.headers.get('x-cache') || '';
        let snippet = '';
        try {
          const t = await res.text();
          snippet = t.substring(0, 150);
        } catch {}
        results.push({ url, status, contentType, server, xCache, snippet });
      } catch (err) {
        // ignore timeouts/dns
      }
    }
  }

  // Phase 2: focus on most interesting hosts (non-403 results) and try each auth strategy on rate-search paths
  const interestingHosts = [...new Set(results.filter(r => r.status !== 403).map(r => new URL(r.url).origin))];
  const ratePaths = ['/v1/spot/search', '/v1/rates/search', '/v1/spot-rates/search', '/api/v1/rates/search', '/v1/quotation'];
  const samplePayload = {
    originPortCode: 'CNSHA',
    destinationPortCode: 'SAJED',
    containerType: '40HC',
    cargoReadyDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    commodityCode: '8517'
  };

  const authProbes = [];
  for (const origin of interestingHosts.slice(0, 6)) {
    for (const path of ratePaths) {
      for (const strategy of strategies) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(`${origin}${path}`, {
            method: 'POST',
            headers: { ...authHeaders(strategy), 'Content-Type': 'application/json' },
            body: JSON.stringify(samplePayload),
            signal: controller.signal
          });
          clearTimeout(timeout);
          if (res.status === 404) continue;
          const snippet = (await res.text().catch(() => '')).substring(0, 200);
          authProbes.push({
            url: `${origin}${path}`,
            strategy,
            status: res.status,
            ok: res.ok,
            snippet
          });
        } catch {}
      }
    }
  }

  return new Response(JSON.stringify({
    env: {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length,
      hasCustomerId: !!customerId,
      customerIdSample: customerId?.slice(0, 8) + '...',
      hasClientSecret: !!clientSecret
    },
    summary: {
      basesTried: baseUrls.length,
      pathsTried: probePaths.length,
      nonFourOhFour: results.length,
      non403: results.filter(r => r.status !== 403).length,
      authProbeSuccesses: authProbes.filter(p => p.ok).length
    },
    promisingResults: results.filter(r => r.status !== 403).slice(0, 25),
    blockedResults: results.filter(r => r.status === 403).slice(0, 5),
    authProbes: authProbes.slice(0, 30),
    hint: 'ابحث عن status 200/401 في authProbes - هذا يعني الـ endpoint صحيح'
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = { runtime: 'edge' };
