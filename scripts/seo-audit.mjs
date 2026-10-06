#!/usr/bin/env node
/**
 * SEO audit of the built site — runs against dist/ after `astro build`.
 *
 * The first check is data integrity (one honest lastmod per URL, media never listed as a page),
 * the second guards the copy rules that are easy to regress: no internal SEO notes in visible
 * text, no absolutes that the privacy policy contradicts.
 *
 * Run with --sitemap-only to check just the XML/robots output.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const websiteDist = path.join(repoRoot, 'website', 'dist');
const appDist = path.join(repoRoot, 'dist');

const siteDist = existsSync(path.join(websiteDist, 'sitemap-0.xml'))
  ? websiteDist
  : existsSync(path.join(appDist, 'sitemap-0.xml'))
    ? appDist
    : null;

const sitemapOnly = process.argv.includes('--sitemap-only');
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

/** Rendered text of a page: markup, scripts and styles stripped, entities resolved. */
function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

if (!siteDist) {
  fail('no built sitemap found — run `astro build` (or `npm run build:web`) first');
}

const urls = [];
const lastmods = new Map();

if (siteDist) {
  const sitemapPath = path.join(siteDist, 'sitemap-0.xml');
  const xml = readFileSync(sitemapPath, 'utf8');

  if (!/xmlns:video="http:\/\/www\.google\.com\/schemas\/sitemap-video\/1\.1"/.test(xml)) {
    fail('sitemap is missing the video namespace declaration');
  }
  if (!/xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/.test(xml)) {
    fail('sitemap is missing the image namespace declaration');
  }

  for (const block of xml.split('<url>').slice(1)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1];
    if (!loc) continue;
    urls.push(loc);
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1];
    if (lastmod) {
      lastmods.set(loc, lastmod);
    }
  }

  // 1. Media must never be listed as an indexable page; it belongs in video:/image: entries.
  const MEDIA = /\.(mp4|webm|mov|webp|png|jpe?g|gif|svg|avif)$/i;
  const mediaUrls = urls.filter((url) => MEDIA.test(new URL(url).pathname));
  if (mediaUrls.length > 0) {
    fail(`media files listed as page URLs: ${mediaUrls.join(', ')}`);
  }

  // 2. Every video entry needs the fields Google requires.
  const videoBlocks = xml.split('<video:video>').slice(1);
  for (const block of videoBlocks) {
    for (const field of ['thumbnail_loc', 'title', 'description', 'content_loc']) {
      if (!new RegExp(`<video:${field}>`).test(block)) {
        fail(`a <video:video> entry is missing <video:${field}>`);
      }
    }
    const thumbnail = /<video:thumbnail_loc>([^<]+)<\/video:thumbnail_loc>/.exec(block)?.[1];
    if (thumbnail && !MEDIA.test(new URL(thumbnail).pathname)) {
      fail(`video thumbnail is not a media file: ${thumbnail}`);
    }
    const title = /<video:title>([^<]*)<\/video:title>/.exec(block)?.[1] ?? '';
    if (title.length > 100) {
      fail(`video title exceeds Google's 100 character limit: ${title}`);
    }
  }

  // 3. lastmod must be a recorded, per-URL date — never a value the build invented.
  const manifestPath = path.join(repoRoot, 'website', 'src', 'data', 'lastmod.json');
  let manifest = null;
  if (!existsSync(manifestPath)) {
    fail('website/src/data/lastmod.json is missing — run `npm run seo:lastmod`');
  } else {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const unrecorded = urls.filter(
      (url) => !((new URL(url).pathname.replace(/\/+$/, '') || '/') in manifest),
    );
    if (unrecorded.length > 0) {
      fail(
        `URLs with no recorded date in lastmod.json (run \`npm run seo:lastmod\`): ${unrecorded
          .map((url) => new URL(url).pathname)
          .join(', ')}`,
      );
    }
    for (const [route, date] of Object.entries(manifest)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        fail(`lastmod.json has a malformed date for ${route}: ${date}`);
      }
    }
  }

  // 3b. Warn when copy changed but `npm run seo:lastmod` was not rerun with it. Committed files
  // only: an untracked file has no publication date yet, so its mtime says nothing.
  try {
    if (!manifest) {
      throw new Error('no manifest to compare against');
    }
    const tracked = new Set(
      execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean),
    );
    const routeSources = JSON.parse(
      readFileSync(path.join(repoRoot, 'website', 'src', 'data', 'route-sources.json'), 'utf8'),
    );
    const stale = [];
    for (const [route, files] of Object.entries(routeSources)) {
      const recorded = manifest[route];
      if (!recorded) continue;
      for (const file of files) {
        const relative = `website/${file}`;
        if (!tracked.has(relative)) continue;
        const mtime = statSync(path.join(repoRoot, relative)).mtimeMs;
        if (new Date(mtime).toISOString().slice(0, 10) > recorded) {
          stale.push(`${route} (${file})`);
        }
      }
    }
    if (stale.length > 0) {
      notes.push(
        `stale lastmod, rerun \`npm run seo:lastmod\`: ${stale.slice(0, 5).join(', ')}${
          stale.length > 5 ? `, +${stale.length - 5} more` : ''
        }`,
      );
    }
  } catch {
    notes.push('skipped lastmod staleness check (git unavailable)');
  }

  const missing = urls.filter((url) => !lastmods.has(url));
  if (missing.length > 0) {
    fail(`URLs without lastmod: ${missing.join(', ')}`);
  }

  const distinct = new Set(lastmods.values());
  notes.push(`sitemap: ${urls.length} URLs, ${distinct.size} distinct lastmod value(s)`);
  if (urls.length > 3 && distinct.size === 1) {
    fail(
      `every URL shares one lastmod (${[...distinct][0]}) — that is a build stamp, not a modification date`,
    );
  }

  const future = [...lastmods.entries()].filter(([, value]) => Date.parse(value) > Date.now() + 86400000);
  if (future.length > 0) {
    fail(`lastmod in the future: ${future.map(([url, value]) => `${url} ${value}`).join(', ')}`);
  }

  // 4. Site-wide signals must not contradict each other.
  const robotsPath = path.join(siteDist, 'robots.txt');
  if (!existsSync(robotsPath)) {
    fail('robots.txt missing from the build output');
  } else {
    const robots = readFileSync(robotsPath, 'utf8');
    // RFC 9309 grouping: consecutive User-agent lines are one group, and the directives that
    // follow apply to every agent in it.
    const groups = [];
    let pendingAgents = [];
    let current = [];
    const flush = () => {
      for (const group of current) group.agents = pendingAgents;
      pendingAgents = [];
      current = [];
    };
    let contentSignal = null;
    for (const rawLine of robots.split('\n')) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const [rawKey, ...rest] = line.split(':');
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key === 'user-agent') {
        if (current.length > 0) flush();
        pendingAgents.push(value.toLowerCase());
      } else if (key === 'sitemap') {
        continue;
      } else {
        if (current.length === 0 && pendingAgents.length > 0) {
          for (const agent of pendingAgents) {
            const group = { agent, allow: false, disallowRoot: false };
            current.push(group);
            groups.push(group);
          }
        }
        if (key === 'allow') {
          for (const group of current) group.allow = true;
        } else if (key === 'disallow' && value === '/') {
          for (const group of current) group.disallowRoot = true;
        } else if (key === 'content-signal') {
          contentSignal = value;
        }
      }
    }

    if (contentSignal && /ai-train\s*=\s*no/i.test(contentSignal)) {
      const allowedTrainers = groups.filter(
        (group) => group.allow && /extended/i.test(group.agent),
      );
      if (allowedTrainers.length > 0) {
        fail(
          `Content-Signal says ai-train=no but these training controls are allowed: ${allowedTrainers
            .map((group) => group.agent)
            .join(', ')}`,
        );
      }
      if (!groups.some((group) => group.disallowRoot)) {
        fail('Content-Signal says ai-train=no but no training crawler is actually refused');
      }
    }

    // 4b. The SPA is thin, JavaScript-rendered content. It must stay crawlable (so the noindex
    // header below is seen, not just assumed) but must never be indexable.
    if (/Disallow:\s*\/app(\/|\*|\s|$)/im.test(robots)) {
      fail('robots.txt blocks /app — a disallowed URL can still be indexed without its noindex header');
    }
  }

  // 4c. vercel.json is what actually serves the noindex header for /app and its query variants.
  const vercelPath = path.join(repoRoot, 'vercel.json');
  if (!existsSync(vercelPath)) {
    notes.push('vercel.json not found — /app noindex header not checked');
  } else {
    const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
    const covers = (route) =>
      (vercel.headers ?? []).some(
        (entry) =>
          entry.source === route &&
          (entry.headers ?? []).some(
            (header) =>
              header.key.toLowerCase() === 'x-robots-tag' && /\bnoindex\b/i.test(header.value),
          ),
      );
    const needed = ['/app{/}?', '/app/:path*'];
    const gaps = needed.filter((route) => !covers(route));
    if (gaps.length > 0) {
      fail(`vercel.json is missing an X-Robots-Tag: noindex header for: ${gaps.join(', ')}`);
    } else {
      notes.push('audit: /app served with X-Robots-Tag noindex (index path and query variants)');
    }
  }
}

// 5. Copy rules. Read the rendered HTML, because the point is what a visitor and a quality rater
// see — data modules and templates both end up here.
if (!sitemapOnly && siteDist) {
  const BANNED = [
    {
      pattern: /0 bytes|zero bytes|0-byte|零上传/i,
      why: 'unsupported absolute — say which artefact is not uploaded instead',
    },
    {
      pattern: /never leaves your (device|computer)[^.]*\./i,
      why: 'scope the claim to the document, or use the shared LOCAL_PROCESSING_* strings',
    },
    {
      pattern: /(?:^|[.\s>])(?:this|the) (?:page|route|feature page) is (?:meant to|the canonical|the main)/i,
      why: 'internal SEO note left in visible copy',
    },
    {
      pattern: /(canonical|main) destination for (?:[a-z-]+ )?(?:searches|intents|queries)/i,
      why: 'internal SEO note left in visible copy',
    },
    {
      pattern: /(?:search|keyword) (?:intent|cluster|quer(?:y|ies))/i,
      why: 'internal SEO note left in visible copy',
    },
    {
      pattern: /intents covered here|lookalike (?:edit )?pages|thin pages|long-tail (?:conversion )?intents/i,
      why: 'internal SEO note left in visible copy',
    },
    {
      pattern: /scattering users|utility routes/i,
      why: 'internal SEO note left in visible copy',
    },
  ];

  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.html')) {
        pages.push(full);
      }
    }
  };
  walk(siteDist);

  for (const page of pages) {
    const text = plainText(readFileSync(page, 'utf8'));

    for (const rule of BANNED) {
      const match = rule.pattern.exec(text);
      if (match) {
        fail(
          `${path.relative(siteDist, page)}: "${match[0].trim().slice(0, 80)}" — ${rule.why}`,
        );
      }
    }
  }
  notes.push(`copy audit: ${pages.length} built page(s) scanned`);

  // 6. Locale pages must not contradict the English offer. Each site renders its own copy, so
  // "every tool is free" in English and "six tools are free" in another locale is a trust bug.
  const LOCALE_TERMS = [
    { file: 'ja.html', label: '/ja', terms: ['ホスティング', '分析', '決済', 'ライセンス認証'] },
    { file: 'zh.html', label: '/zh', terms: ['托管', '分析', '结算', '许可证验证'] },
  ];
  const OFFER_TERMS = [
    { pattern: /6つ?の?コアツールはすべて完全に無料/, why: 'says only six tools are free' },
    { pattern: /六大核心工具完全免费/, why: 'says only six tools are free' },
  ];

  for (const locale of LOCALE_TERMS) {
    const page = path.join(siteDist, locale.file);
    if (!existsSync(page)) continue;
    const text = plainText(readFileSync(page, 'utf8'));
    const missing = locale.terms.filter((term) => !text.includes(term));
    if (missing.length > 0) {
      fail(
        `${locale.label} is missing the local-vs-infrastructure disclosure (${missing.join(', ')}) — keep it aligned with the English FAQ`,
      );
    }
    for (const rule of OFFER_TERMS) {
      const match = rule.pattern.exec(text);
      if (match) {
        fail(`${locale.label}: "${match[0]}" — ${rule.why}`);
      }
    }
  }

  // 7. VideoObject. Google requires name, thumbnailUrl and uploadDate, recommends description,
  // duration and contentUrl, and wants name unique site-wide plus a unique description per clip.
  // The transcript is our own addition (schema.org, not read by Google) and is what makes a
  // silent screencast machine-readable, so it is checked too.
  const REQUIRED = ['name', 'thumbnailUrl', 'uploadDate'];
  const RECOMMENDED = ['description', 'duration', 'contentUrl', 'transcript'];
  const videoObjects = [];
  const pageHasVideoTag = new Set();

  for (const page of pages) {
    const raw = readFileSync(page, 'utf8');
    const relative = path.relative(siteDist, page);
    if (/<video[\s>]/.test(raw)) {
      pageHasVideoTag.add(relative);
    }
    for (const match of raw.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )) {
      let data;
      try {
        data = JSON.parse(match[1]);
      } catch (error) {
        fail(`${relative}: invalid JSON-LD — ${error.message}`);
        continue;
      }
      const nodes = (Array.isArray(data) ? data : [data]).flatMap((node) =>
        node && node['@graph'] ? node['@graph'] : [node],
      );
      for (const node of nodes) {
        if (node && node['@type'] === 'VideoObject') {
          videoObjects.push({ page: relative, node });
        }
      }
    }
  }

  const names = new Map();
  const descriptions = new Map();
  for (const { page, node } of videoObjects) {
    const label = `${page} :: ${String(node.name).slice(0, 48)}`;
    for (const field of REQUIRED) {
      if (!node[field]) fail(`${label}: VideoObject is missing required "${field}"`);
    }
    for (const field of RECOMMENDED) {
      if (!node[field]) fail(`${label}: VideoObject is missing recommended "${field}"`);
    }
    if (node.duration && !/^PT(\d+H)?(\d+M)?(\d+S)?$/.test(node.duration)) {
      fail(`${label}: duration "${node.duration}" is not ISO 8601`);
    }
    if (node.uploadDate && Number.isNaN(Date.parse(node.uploadDate))) {
      fail(`${label}: uploadDate "${node.uploadDate}" is not a date`);
    }
    if (node.transcript && String(node.transcript).length < 80) {
      fail(`${label}: transcript is too short to describe the clip`);
    }
    for (const field of ['thumbnailUrl', 'contentUrl']) {
      const values = node[field] ? [].concat(node[field]) : [];
      for (const value of values) {
        if (!/^https:\/\/localpdf\.online\//.test(value)) {
          fail(`${label}: ${field} must be an absolute URL on localpdf.online — got ${value}`);
          continue;
        }
        const localPath = path.join(siteDist, new URL(value).pathname);
        if (!existsSync(localPath)) {
          fail(`${label}: ${field} points at a file missing from the build — ${value}`);
        }
      }
    }
    if (node.name) {
      names.set(node.name, (names.get(node.name) ?? 0) + 1);
    }
    if (node.description) {
      descriptions.set(node.description, (descriptions.get(node.description) ?? 0) + 1);
    }
  }

  for (const [name, count] of names) {
    if (count > 1) fail(`VideoObject name is used ${count} times: "${name}"`);
  }
  for (const [description, count] of descriptions) {
    if (count > 1) {
      fail(`VideoObject description is used ${count} times: "${description.slice(0, 60)}..."`);
    }
  }
  for (const page of pageHasVideoTag) {
    if (!videoObjects.some((entry) => entry.page === page)) {
      fail(`${page}: renders a <video> but ships no VideoObject markup`);
    }
  }

  // A watch page that is missing from the sitemap relies on internal links alone.
  const sitemapPaths = new Set(urls.map((url) => new URL(url).pathname.replace(/\/+$/, '') || '/'));
  for (const page of new Set(videoObjects.map((entry) => entry.page))) {
    const route = page.replace(/index\.html$/, '').replace(/\.html$/, '');
    if (!sitemapPaths.has(`/${route}`)) {
      fail(`${page}: page carries VideoObject but is not in the sitemap`);
    }
  }

  notes.push(
    `VideoObject audit: ${videoObjects.length} object(s) across ${pageHasVideoTag.size} page(s) with video`,
  );
}

for (const note of notes) {
  console.log(`  · ${note}`);
}

if (failures.length > 0) {
  console.error('\nSEO audit failed:');
  for (const failure of failures) {
    console.error(`  ✗ ${failure}`);
  }
  process.exit(1);
}

console.log('SEO audit passed.');
