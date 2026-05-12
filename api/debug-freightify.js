/**
 * Diagnostic endpoint to discover Freightify's actual API endpoints
 * Visit: /api/debug-freightify to see what's working
 */

export default async function handler(req) {
  const apiKey = process.env.FREIGHTIFY_API_KEY;
  const customerId = process.env.FREIGHTIFY_CUSTOMER_ID;
  const clientSecret = process.env.FREIGHTIFY_CLIENT_SECRET;

  const baseUrls = [
    'https://api.freightify.com',
    'https://app.freightify.com/api',
    'https://platform.freightify.com/api',
    'https://api.freightify.io',
    'https://freightify-api.freightify.com',
    'https://gateway.freightify.com'
  ];

  const probePaths = [
    '/',
    '/v1',
    '/api/v1',
    '/health',
    '/v1/health',
    '/api/health',
    '/openapi.json',
    '/swagger.json',
    '/docs',
    '/v1/ports',
    '/api/ports',
    '/v1/carriers',
    '/api/carriers'
  ];

  const results = [];

  for (const base of baseUrls) {
    for (const path of probePaths) {
      const url = `${base}${path}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-API-Key': apiKey,
            'apikey': apiKey,
            'Authorization': `Bearer ${apiKey}`,
            'freightify-api-key': apiKey,
            'X-Customer-Id': customerId
          },
          signal: controller.signal
        });
        clearTimeout(timeout);
        const contentType = res.headers.get('content-type') || '';
        let bodySnippet = '';
        try {
          const text = await res.text();
          bodySnippet = text.substring(0, 200);
        } catch {}

        if (res.status !== 404) {
          results.push({
            url,
            status: res.status,
            ok: res.ok,
            contentType,
            bodySnippet
          });
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !err.message.includes('fetch failed')) {
          results.push({ url, error: err.message });
        }
      }
    }
  }

  // Try auth endpoints with POST
  const authAttempts = [];
  for (const base of baseUrls.slice(0, 3)) {
    for (const path of ['/v1/auth/login', '/api/auth/login', '/oauth/token', '/login', '/auth/token', '/api/v1/login']) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId,
            client_secret: clientSecret,
            api_key: apiKey
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        const body = await res.text().catch(() => '');
        if (res.status !== 404 && body.length < 1000) {
          authAttempts.push({
            url: `${base}${path}`,
            status: res.status,
            body: body.substring(0, 300)
          });
        }
      } catch {}
    }
  }

  return new Response(JSON.stringify({
    env: {
      hasApiKey: !!apiKey,
      hasCustomerId: !!customerId,
      hasClientSecret: !!clientSecret,
      apiKeyLength: apiKey?.length,
      customerIdFormat: customerId?.match(/^[a-f0-9-]{36}$/) ? 'UUID' : 'other'
    },
    discoveredEndpoints: results.length,
    results: results.slice(0, 30),
    authAttempts: authAttempts.slice(0, 20),
    hint: 'إذا كل النتائج 401/403 فالـ credentials تشتغل. إذا 404 فعنوان الـ API مختلف.'
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = {
  runtime: 'edge'
};
