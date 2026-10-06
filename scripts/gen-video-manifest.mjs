#!/usr/bin/env node
/**
 * Regenerates website/src/data/video-manifest.json — facts about the on-site demo clips that the
 * VideoObject markup needs but that cannot be read from the page: the media file's own byte
 * duration, and the date the clip was actually published.
 *
 * Publishing date comes from the newest commit that touched the .mp4 (falling back to mtime for
 * an uncommitted recording). A committed manifest rather than runtime inspection, because the
 * production build runs from a `.git`-less clone and ffprobe is not available there.
 *
 * Usage: node scripts/gen-video-manifest.mjs   (also included in `npm run seo:lastmod`)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const websiteRoot = path.join(repoRoot, 'website');
const demoDir = path.join(websiteRoot, 'public', 'demo');
const manifestPath = path.join(websiteRoot, 'src', 'data', 'video-manifest.json');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);

/** ISO 8601 duration, seconds resolution: 3.07s -> PT3S. */
function isoDuration(seconds) {
  const total = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `PT${minutes}M${rest}S` : `PT${rest}S`;
}

function probeDuration(absolutePath) {
  const raw = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', absolutePath],
    { encoding: 'utf8' },
  ).trim();
  const seconds = Number.parseFloat(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe returned no usable duration for ${path.basename(absolutePath)}`);
  }
  return isoDuration(seconds);
}

function commitDate(relativePath) {
  try {
    const value = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', `website/public/demo/${relativePath}`],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (value) return value;
  } catch {
    /* not a git checkout, or the file is new */
  }
  const absolute = path.join(demoDir, relativePath);
  return new Date(statSync(absolute).mtimeMs).toISOString();
}

if (!existsSync(demoDir)) {
  throw new Error(`demo directory not found: ${demoDir}`);
}

const manifest = {};
for (const entry of readdirSync(demoDir).sort()) {
  if (!VIDEO_EXTENSIONS.has(path.extname(entry))) continue;
  const absolute = path.join(demoDir, entry);
  manifest[`/demo/${entry}`] = {
    duration: probeDuration(absolute),
    uploadDate: commitDate(entry),
  };
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${Object.keys(manifest).length} clip durations/upload dates to website/src/data/video-manifest.json`);

// The hand-written per-clip copy (title, description, transcript) must cover every clip, or a
// page would ship a <video> with no VideoObject.
const sources = [];
for (const file of readdirSync(path.join(websiteRoot, 'src', 'data', 'features'))) {
  sources.push(readFileSync(path.join(websiteRoot, 'src', 'data', 'features', file), 'utf8'));
}
// Page-level clips (home, private editor) live in their own module.
sources.push(readFileSync(path.join(websiteRoot, 'src', 'data', 'page-demo-videos.ts'), 'utf8'));
const declared = new Set(
  sources.flatMap((source) => [...source.matchAll(/src:\s*'(\/demo\/[^']+)'/g)].map((m) => m[1])),
);
const undocumented = Object.keys(manifest).filter((src) => !declared.has(src));
const phantom = [...declared].filter((src) => !(src in manifest));
if (undocumented.length > 0) {
  console.error(`✗ demo clips with no VideoObject copy in data: ${undocumented.join(', ')}`);
  process.exit(1);
}
if (phantom.length > 0) {
  console.error(`✗ VideoObject copy points at missing clips: ${phantom.join(', ')}`);
  process.exit(1);
}
console.log(`Coverage ok: ${declared.size} clip(s) documented.`);
