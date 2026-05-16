/**
 * FREIGHTLX Ports Search Endpoint (v3.1)
 *
 * GET /api/ports?q=shanghai       → text search
 * GET /api/ports?code=CNSHA       → exact code lookup
 * GET /api/ports?country=Saudi    → filter by country
 * GET /api/ports?region=Middle    → filter by region
 * GET /api/ports?stats=1          → DB stats
 *
 * Backed by api/ports_db.json — 323 vetted UN/LOCODE ports.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const config = { runtime: 'nodejs', maxDuration: 10 };

let DB = null;
function loadDB() {
  if (DB) return DB;
  try {
    DB = JSON.parse(readFileSync(join(process.cwd(), 'api', 'ports_db.json'), 'utf-8'));
  } catch { DB = []; }
  return DB;
}

function normalize(s) {
  return String(s || '').toLowerCase().trim();
}

function search({ q, code, country, region, tier, limit = 10 }) {
  let db = loadDB();
  limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

  if (code) {
    const c = String(code).toUpperCase().trim();
    return db.filter(p => p.code === c);
  }

  if (country) {
    const c = normalize(country);
    db = db.filter(p => normalize(p.country).includes(c));
  }
  if (region) {
    const r = normalize(region);
    db = db.filter(p => normalize(p.region).includes(r));
  }
  if (tier) {
    const t = normalize(tier);
    db = db.filter(p => normalize(p.tier).includes(t));
  }

  if (q) {
    const nq = normalize(q);
    const tokens = nq.split(/\s+/).filter(t => t.length >= 2);
    if (tokens.length) {
      const scored = [];
      for (const p of db) {
        const hay = normalize(`${p.name} ${p.code} ${p.country}`);
        let score = 0;
        for (const t of tokens) if (hay.includes(t)) score++;
        // Boost Tier 1 ports
        if (score > 0 && p.tier === 'Tier 1') score += 0.5;
        if (score > 0) scored.push({ p, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map(s => s.p);
    }
  }

  return db.slice(0, limit);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const params = {
      q:       url.searchParams.get('q'),
      code:    url.searchParams.get('code'),
      country: url.searchParams.get('country'),
      region:  url.searchParams.get('region'),
      tier:    url.searchParams.get('tier'),
      limit:   url.searchParams.get('limit'),
    };

    if (url.searchParams.get('stats') === '1') {
      const db = loadDB();
      const by_region = {};
      const by_country = {};
      const by_tier = {};
      for (const p of db) {
        by_region[p.region] = (by_region[p.region] || 0) + 1;
        by_country[p.country] = (by_country[p.country] || 0) + 1;
        by_tier[p.tier] = (by_tier[p.tier] || 0) + 1;
      }
      return res.status(200).json({
        ok: true,
        total: db.length,
        by_region,
        by_tier,
        countries_count: Object.keys(by_country).length,
      });
    }

    if (!params.q && !params.code && !params.country && !params.region) {
      return res.status(400).json({
        ok: false,
        error: 'provide q, code, country, or region',
        examples: ['/api/ports?q=shanghai', '/api/ports?code=SAJED', '/api/ports?country=Saudi'],
      });
    }

    const results = search(params);
    return res.status(200).json({
      ok: true,
      query: params,
      count: results.length,
      results,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
