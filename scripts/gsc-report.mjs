#!/usr/bin/env node
/**
 * Google Search Console report for the marketing site.
 *
 * Read-only: uses a service account that has been granted access to the property in
 * Search Console. Point GSC_SA_PATH at the key file (defaults to ~/.gsc-service-account.json).
 *
 * Usage:
 *   node scripts/gsc-report.mjs                 # last 90 days, site from GSC_SITE
 *   node scripts/gsc-report.mjs --days=28
 *   node scripts/gsc-report.mjs --site=https://example.com/
 *
 * Interpreting it:
 *   - "gap" is impressions x (expected CTR at that position - actual CTR). Positive means the
 *     page or snippet is underperforming its ranking; negative means it beats the benchmark.
 *   - "striking distance" lists commercial queries on positions 4-20 with real impression
 *     volume: the cheapest ranking work available.
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const SA_PATH = process.env.GSC_SA_PATH ?? join(homedir(), '.gsc-service-account.json');
const SITE = argValue('site', process.env.GSC_SITE ?? 'https://localpdf.online/');
const DAYS = Number(argValue('days', '90'));
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken() {
  const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat: now, exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${JSON.stringify(json)}`);
  return json.access_token;
}

async function query(body) {
  const token = await accessToken();
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`GSC query failed: ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json.rows ?? [];
}

const end = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
const start = new Date(Date.now() - (DAYS + 3) * 86400000).toISOString().slice(0, 10);
const expectedCtr = (p) => (p <= 1 ? 0.28 : p <= 2 ? 0.15 : p <= 3 ? 0.1 : p <= 4 ? 0.07 : p <= 5 ? 0.05
  : p <= 6 ? 0.04 : p <= 8 ? 0.025 : p <= 10 ? 0.018 : p <= 15 ? 0.01 : 0.005);
const short = (url) => url.replace('https://localpdf.online', '') || '/';

const [totals, pages, queryPages] = await Promise.all([
  query({ startDate: start, endDate: end, type: 'web' }),
  query({ startDate: start, endDate: end, dimensions: ['page'], rowLimit: 25000, type: 'web' }),
  query({ startDate: start, endDate: end, dimensions: ['query', 'page'], rowLimit: 25000, type: 'web' }),
]);

console.log(`GSC · ${SITE} · ${start} … ${end} (${DAYS} дней)`);
const t = totals[0] ?? { clicks: 0, impressions: 0 };
console.log(`всего: ${t.clicks.toFixed(0)} кликов, ${t.impressions.toFixed(0)} показов, CTR ${(t.ctr * 100).toFixed(1)}%\n`);

console.log('=== страницы: CTR против ожидаемого для позиции ===');
console.log('  страница'.padEnd(42) + 'показы  клики    CTR    поз   недобор');
for (const r of [...pages].sort((a, b) => b.impressions - a.impressions).slice(0, 15)) {
  const gap = Math.round(r.impressions * (expectedCtr(r.position) - r.ctr));
  console.log(`  ${short(r.keys[0]).padEnd(40)}${String(r.impressions).padStart(6)}${String(r.clicks).padStart(7)}${(r.ctr * 100).toFixed(1).padStart(7)}%${r.position.toFixed(1).padStart(7)}${String(gap > 0 ? `+${gap}` : gap).padStart(9)}`);
}

const pairs = queryPages.map((r) => ({ q: r.keys[0], p: short(r.keys[1]), i: r.impressions, c: r.clicks, pos: r.position }));
const striking = pairs.filter((r) => r.i >= 20 && r.pos >= 3 && r.pos <= 20).sort((a, b) => b.i - a.i);
console.log(`\n=== в зоне быстрых побед (показы ≥ 20, позиция 3–20): ${striking.length} запросов ===`);
for (const r of striking.slice(0, 15)) {
  console.log(`  ${String(r.i).padStart(5)} показов ${String(r.c).padStart(4)} кл  поз ${r.pos.toFixed(1).padStart(5)}  ${r.p}  ← ${r.q.slice(0, 52)}`);
}

/* Brand queries should land on the homepage; deep pages there convert an order of magnitude worse. */
const brandRe = /local\s?pdf|pdf\s?local|pdflokal|private\s?pdf/i;
const home = pairs.filter((r) => brandRe.test(r.q) && r.p === '/').reduce((a, r) => ({ i: a.i + r.i, c: a.c + r.c }), { i: 0, c: 0 });
const deep = pairs.filter((r) => brandRe.test(r.q) && r.p !== '/').reduce((a, r) => ({ i: a.i + r.i, c: a.c + r.c }), { i: 0, c: 0 });
console.log('\n=== брендовые запросы ===');
console.log(`  на главной:     ${home.i} показов, ${home.c} кликов (CTR ${home.i ? ((home.c / home.i) * 100).toFixed(1) : '0'}%)`);
console.log(`  на глубоких:    ${deep.i} показов, ${deep.c} кликов (CTR ${deep.i ? ((deep.c / deep.i) * 100).toFixed(1) : '0'}%)`);
if (deep.i > 0 && home.i > 0 && deep.c / deep.i < home.c / home.i / 3) {
  console.log('  ⚠ брендовые показы утекают на глубокие страницы: проверь, есть ли название бренда в их <title>');
}
