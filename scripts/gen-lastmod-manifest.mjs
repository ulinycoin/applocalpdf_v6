#!/usr/bin/env node
/**
 * Regenerates website/src/data/lastmod.json — the per-URL modification dates the sitemap emits.
 *
 * Why a committed manifest instead of reading git at build time: the production build runs on a
 * fresh clone where `.git` is absent, so `git log` yields nothing and every file's mtime is the
 * checkout time. That is exactly the "all URLs changed today" stamp the manifest exists to avoid.
 *
 * Each route is dated from the newest commit (or mtime, for uncommitted work) among the files that
 * render it, per website/src/data/route-sources.ts. Dates are date-only, matching how sitemaps are
 * normally consumed.
 *
 * Usage: node scripts/gen-lastmod-manifest.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const websiteRoot = path.join(repoRoot, 'website');
const manifestPath = path.join(websiteRoot, 'src', 'data', 'lastmod.json');
const routeSourcesPath = path.join(websiteRoot, 'src', 'data', 'route-sources.json');

const ROUTES = JSON.parse(readFileSync(routeSourcesPath, 'utf8'));

if (Object.keys(ROUTES).length < 20) {
  throw new Error(`route-sources.json yielded only ${Object.keys(ROUTES).length} routes`);
}

const cache = new Map();

function dateForFile(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath);

  let stamp = null;
  try {
    const committed = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', `website/${relativePath}`],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (committed) stamp = Date.parse(committed);
  } catch {
    stamp = null;
  }

  if (stamp === null || Number.isNaN(stamp)) {
    const absolute = path.join(websiteRoot, relativePath);
    if (!existsSync(absolute)) {
      throw new Error(`route source not found: website/${relativePath}`);
    }
    stamp = statSync(absolute).mtimeMs;
  }

  const date = new Date(stamp).toISOString().slice(0, 10);
  cache.set(relativePath, date);
  return date;
}

const manifest = {};
for (const route of Object.keys(ROUTES).sort()) {
  const dates = ROUTES[route].map(dateForFile);
  manifest[route] = dates.sort().at(-1);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${Object.keys(manifest).length} route dates to website/src/data/lastmod.json`);
