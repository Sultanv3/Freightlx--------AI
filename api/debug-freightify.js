/**
 * Fast diagnostic endpoint v3 - parallel probes
 * Visit: /api/debug-freightify
 */

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req) {
  const apiKey = process.env.FREIGHTIFY_API_KEY;
  const customerId = process.env.FREIGHTIFY_CUSTOMER_ID;
  const clientSecret = process.env.FREIGHTIFY_CLIENT_SECRET;

  const baseUrls = [
    'https://api.freightify.com',
    'https://link.freightify.com',
    'https://link-api.freightify.com',
    'https://rates.freightify.com',
    'https://b2b.freightify.com',
    'https://gateway.freightify.com',
    'https://partner.freightify.com',
    'https://sandbox.freightify.com',
    'https://my.freightify.com'
  ];

  const probePaths = ['/', '/v1', '/v1/health', '/v1/spot/search', '/swagger.json', '/openapi.json'];

  function probeFetch(url, opts = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    return fetch(url, {
      ...opts,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'X-API-Key': apiKey,
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'X-Customer-Id': customerId,
        'freightify-api-key': apiKey,
        ...(opts.headers || {})
      },
      signal: controller.signal
    })
      .then(async res => {
        clearTimeout(timeout);
        const text = await res.text().catch(() => '');
        return {
          url,
          status: res.status,
          ok: res.ok,
          server: res.headers.get('server') || '',
          contentType: res.headers.get('content-type') || '',
          snippet: text.substring(0, 120)
        };
      })
      .catch(err => ({ url, error: err.name === 'AbortError' ? 'timeout' : err.message }));
  }

  // Build all GET probe URLs
  const probes = [];
  for (const base of baseUrls) {
    for (const path of probePaths) {
      probes.push(`${base}${path}`);
    }
  }

  // Run ALL probes in parallel
  const probeResults = await Promise.all(probes.map(u => probeFetch(u)));

  // Filter to interesting (non-404, non-AbortError) results
  const nonFourOhFour = probeResults.filter(r => r.status && r.status !== 404);
  const non403 = nonFourOhFour.filter(r => r.status !== 403);
  const hostsThatRespond = [...new Set(nonFourOhFour.map(r => new URL(r.url).origin))];

  // Phase 2: For hosts that respond differently, try POST to rate-search paths
  const ratePosts = [];
  const ratePaths = ['/v1/spot/search', '/v1/rates/search', '/v1/spot-rates/search'];
  const payload = {
    originPortCode: 'CNSHA',
    destinationPortCode: 'SAJED',
    containerType: '40HC',
    cargoReadyDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  };

  for (const origin of hostsThatRespond.slice(0, 4)) {
    for (const path of ratePaths) {
      ratePosts.push(probeFetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }));
    }
  }

  const ratePostResults = await Promise.all(ratePosts);
  const promisingPosts = ratePostResults.filter(r => r.status && r.status !== 404);

  return new Response(JSON.stringify({
    env: {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      hasCustomerId: !!customerId,
      hasClientSecret: !!clientSecret
    },
    summary: {
      totalProbes: probes.length,
      responded: nonFourOhFour.length,
      non403: non403.length,
      hostsRespond: hostsThatRespond
    },
    nonForbidden: non403.slice(0, 20),
    forbiddenHosts: nonFourOhFour.filter(r => r.status === 403).map(r => r.url).slice(0, 10),
    ratePostResults: promisingPosts.slice(0, 12),
    hint: 'إذا كل النتائج 403 من api.freightify.com، الحل: تواصل مع Freightify Support لتفعيل IP whitelisting أو الحصول على custom domain لحسابك'
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = { runtime: 'edge' };
