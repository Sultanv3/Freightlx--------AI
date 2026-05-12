/**
 * v4 - Probe api-portal.freightify.com (the REAL portal URL)
 * Visit: /api/debug-freightify
 */

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req) {
  const apiKey = process.env.FREIGHTIFY_API_KEY;
  const customerId = process.env.FREIGHTIFY_CUSTOMER_ID;
  const clientSecret = process.env.FREIGHTIFY_CLIENT_SECRET;

  // The portal URL the user shared - try it AND derivative subdomains
  const baseUrls = [
    'https://api-portal.freightify.com',
    'https://api.freightify.com',
    'https://api-portal.freightify.com/api',
    'https://api-portal.freightify.com/v1',
    'https://api-link.freightify.com',
    'https://link.api.freightify.com'
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
    '/v1/schedules/search',
    '/swagger.json',
    '/swagger/v1/swagger.json',
    '/openapi.json',
    '/api-docs/swagger.json',
    '/swagger-ui',
    '/docs',
    '/portal'
  ];

  function probeFetch(url, opts = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    return fetch(url, {
      ...opts,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'X-API-Key': apiKey,
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'X-Customer-Id': customerId,
        'customer-id': customerId,
        'freightify-customer-id': customerId,
        ...(opts.headers || {})
      },
      signal: controller.signal
    })
      .then(async res => {
        clearTimeout(timeout);
        const text = await res.text().catch(() => '');
        return {
          url,
          method: opts.method || 'GET',
          status: res.status,
          ok: res.ok,
          contentType: res.headers.get('content-type') || '',
          server: res.headers.get('server') || '',
          snippet: text.substring(0, 200)
        };
      })
      .catch(err => ({ url, error: err.name === 'AbortError' ? 'timeout' : err.message }));
  }

  // Phase 1: GET probes in parallel
  const probes = [];
  for (const base of baseUrls) {
    for (const path of probePaths) {
      probes.push(`${base}${path}`);
    }
  }
  const probeResults = await Promise.all(probes.map(u => probeFetch(u)));
  const nonFourOhFour = probeResults.filter(r => r.status && r.status !== 404);
  const apiLike = nonFourOhFour.filter(r =>
    (r.contentType || '').includes('json') ||
    (r.snippet || '').trim().startsWith('{') ||
    (r.snippet || '').trim().startsWith('[')
  );

  // Phase 2: POST to spot-search style endpoints on the most promising hosts
  const promising = [...new Set(nonFourOhFour.map(r => new URL(r.url).origin))];
  const ratePaths = [
    '/v1/spot/search',
    '/v1/spot-rates/search',
    '/v1/rates/spot/search',
    '/v1/schedules/search',
    '/api/v1/spot/search'
  ];
  const payload = {
    originPortCode: 'CNSHA',
    destinationPortCode: 'SAJED',
    containerType: '40HC',
    cargoReadyDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    commodityCode: '8517'
  };
  const ratePosts = [];
  for (const origin of promising.slice(0, 5)) {
    for (const path of ratePaths) {
      ratePosts.push(probeFetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }));
    }
  }
  const ratePostResults = await Promise.all(ratePosts);
  const promisingPosts = ratePostResults.filter(r => r.status && r.status !== 404 && r.status !== 405);

  return new Response(JSON.stringify({
    env: {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      hasCustomerId: !!customerId,
      hasClientSecret: !!clientSecret
    },
    summary: {
      probesSent: probes.length,
      responded: nonFourOhFour.length,
      jsonLike: apiLike.length
    },
    apiLikeResponses: apiLike.slice(0, 15),
    allNon404: nonFourOhFour.slice(0, 25),
    ratePostResults: promisingPosts.slice(0, 15),
    hint: 'الـ apiLikeResponses هي اللي ترد JSON - فيها الـ API الحقيقي'
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = { runtime: 'edge' };
