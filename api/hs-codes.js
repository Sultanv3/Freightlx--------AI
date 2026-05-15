/**
 * FREIGHTLX HS Code Search Endpoint (v2.38)
 *
 * GET  /api/hs-codes?q=keyword        → text search across Arabic+English category names
 * GET  /api/hs-codes?hs=251511        → prefix match against HS code
 * POST /api/hs-codes                  → body: { q?, hs?, limit? }
 *
 * Backed by api/hs_codes_db.json — 9,862 KSA HS codes with technical regulations
 * and required certificates (QM, GCTS, IEC, Plastic, COC, Tires, TAQYEES, IECEE, IECEX).
 *
 * Source: official Saudi SABER + ZATCA Regulated/Non-Regulated dataset (Feb 2025).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const config = { runtime: 'nodejs', maxDuration: 10 };

// Lazy-load DB on first request (kept warm by Vercel Node runtime)
let DB = null;
function loadDB() {
  if (DB) return DB;
  try {
    const p = join(process.cwd(), 'api', 'hs_codes_db.json');
    DB = JSON.parse(readFileSync(p, 'utf-8'));
  } catch (e) {
    DB = [];
  }
  return DB;
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ْ]/g, '')      // Arabic diacritics
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

function search({ q, hs, limit = 10 }) {
  const db = loadDB();
  limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

  if (hs) {
    const prefix = String(hs).replace(/\D/g, '');
    if (!prefix) return [];
    return db.filter(r => r.hs.startsWith(prefix)).slice(0, limit);
  }

  if (q) {
    const nq = normalize(q);
    const tokens = nq.split(/\s+/).filter(t => t.length >= 2);
    if (!tokens.length) return [];

    // Score each record by token match count across all text fields
    const scored = [];
    for (const r of db) {
      const hay = normalize(`${r.cat_ar} ${r.cat_en} ${r.reg_ar} ${r.reg_en}`);
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score++;
      if (score > 0) scored.push({ r, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.r);
  }

  return [];
}

function summary() {
  const db = loadDB();
  const regs = {};
  for (const r of db) {
    const k = r.reg_en || 'Unknown';
    regs[k] = (regs[k] || 0) + 1;
  }
  const top = Object.entries(regs).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return {
    total: db.length,
    distinct_regulations: Object.keys(regs).length,
    top_regulations: top.map(([name, count]) => ({ name, count })),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    let q = url.searchParams.get('q');
    let hs = url.searchParams.get('hs');
    let limit = url.searchParams.get('limit');
    const stats = url.searchParams.get('stats');

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};
      q = q || body.q || body.query;
      hs = hs || body.hs || body.hsCode || body.code;
      limit = limit || body.limit;
    }

    if (stats === '1' || stats === 'true') {
      return res.status(200).json({ ok: true, ...summary() });
    }

    if (!q && !hs) {
      return res.status(400).json({
        ok: false,
        error: 'provide q (search text) or hs (HS code prefix), or stats=1 for DB stats',
        examples: [
          '/api/hs-codes?q=سماعات',
          '/api/hs-codes?q=bluetooth headphones',
          '/api/hs-codes?hs=851830',
          '/api/hs-codes?stats=1',
        ],
      });
    }

    const results = search({ q, hs, limit });
    return res.status(200).json({
      ok: true,
      query: q || null,
      hs_prefix: hs || null,
      count: results.length,
      results,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
