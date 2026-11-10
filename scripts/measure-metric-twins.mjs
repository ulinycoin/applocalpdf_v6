#!/usr/bin/env node
/**
 * Does the metric-twin substitution actually keep a document's layout?
 *
 * The claim under test is narrow and checkable: a twin has the same advance width per glyph as the
 * face it replaces, so a line drawn with it occupies the same space — same line breaks, same column
 * widths, same right edge. Glyph shapes differ slightly; nothing else should.
 *
 * For every embedded program in the corpus it maps to a twin, this compares per-character advance
 * widths (normalised by units-per-em, so the comparison is size independent) and reports the drift.
 * Characters that either face lacks are skipped: a subset that never had `ē` says nothing about
 * metrics.
 *
 * Usage:
 *   node scripts/measure-metric-twins.mjs [--corpus <dir>] [--out <file>] [--quiet]
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { scanDocument } from './measure-font-reuse.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_CORPUS = path.join(ROOT, 'test/fixtures/font-corpus');
const DEFAULT_OUT = path.join(ROOT, 'test-results/metric-twin-drift.json');
const MANIFEST = path.join(ROOT, 'shared/studio-text-edit/metric-twins.json');

/** Characters a Latvian/European business document contains; `ē`/`ķ` are the interesting ones. */
const PROBE_ALPHABET = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '0123456789',
  ' .,-–—/()%€$',
  'āčēģīķļņšūž',
].join('');

/** Strings whose rendered width decides line breaks in the documents we care about. */
const PROBE_WORDS = ['Invoice', 'Contract', 'Rēķins', 'Rīga', 'Jelgava', 'Total', 'Договор', '2026', '1 234,56'];

const round = (value, digits = 4) => (typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : value);

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function parseArgs(argv) {
  const args = { corpus: DEFAULT_CORPUS, out: DEFAULT_OUT, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--quiet') args.quiet = true;
    else if (arg === '--corpus') args.corpus = path.resolve(argv[++i]);
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg.startsWith('--corpus=')) args.corpus = path.resolve(arg.slice(9));
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.slice(6));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

const normalize = (name) => (name ?? '').replace(/^[A-Z]{6}\+/u, '').toLowerCase().replace(/[^a-z0-9]/gu, '');

function resolveTwin(manifest, baseFont) {
  const name = normalize(baseFont);
  if (!name) return undefined;
  const matchers = manifest.families
    .flatMap((family) => family.patterns.map((pattern) => ({ pattern, family })))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  return matchers.find((matcher) => name.includes(matcher.pattern))?.family;
}

/** Weight and slant implied by the PostScript name, so a bold run is compared with the bold twin. */
function fontAttributesOf(baseFont) {
  const name = (baseFont ?? '').toLowerCase();
  return {
    weight: /bold|black|heavy|semibold|demibold|[789]00/u.test(name) ? '700' : '400',
    style: /italic|oblique/u.test(name) ? 'italic' : 'normal',
  };
}

/** Twin slice bytes: the copied asset first, the package it came from second. */
async function loadTwinFont(family, subset, weight = '400', style = 'normal') {
  const file = `${family.id}-${subset}-${weight}-${style}.woff`;
  const candidates = [
    path.join(ROOT, 'public', 'fonts', file),
    path.join(ROOT, 'node_modules', '@fontsource', family.id, 'files', file),
  ];
  for (const candidate of candidates) {
    try {
      return fontkit.create(await readFile(candidate));
    } catch {
      // try the next location
    }
  }
  return null;
}

/** Advance width in units-per-em, so two faces at different upem compare directly. */
function advanceOf(font, codePoint) {
  try {
    const has = typeof font.hasGlyphForCodePoint === 'function'
      ? font.hasGlyphForCodePoint(codePoint)
      : Boolean(font.glyphForCodePoint(codePoint)?.id);
    if (!has) return null;
    const glyph = font.glyphForCodePoint(codePoint);
    const upem = font.unitsPerEm ?? 1000;
    return glyph.advanceWidth / upem;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = args.quiet ? () => {} : (...parts) => console.log(...parts);
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));

  const files = (await readdir(args.corpus)).filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
  if (files.length === 0) throw new Error(`no PDFs in ${args.corpus} — run scripts/fetch-font-corpus.mjs first`);

  // Loading a slice is not free and the corpus revisits the same families constantly.
  const twinCache = new Map();
  const getTwin = async (family, subset, weight, style) => {
    const key = `${family.id}:${subset}:${weight}:${style}`;
    if (!twinCache.has(key)) {
      let font = await loadTwinFont(family, subset, weight, style);
      if (!font && (weight !== '400' || style !== 'normal')) {
        missingSlices.add(`${family.id}-${subset}-${weight}-${style}`);
        font = await loadTwinFont(family, subset);
      }
      twinCache.set(key, font);
    }
    return twinCache.get(key);
  };

  const perTwin = new Map();
  const perPair = new Map();
  const missingSlices = new Set();
  let programsTotal = 0;
  let programsParsed = 0;
  let programsWithTwin = 0;
  let programsCompared = 0;
  let referencesWithTwin = 0;
  let referencesTotal = 0;
  const documentsWithTwin = new Set();

  for (const name of files) {
    const doc = await scanDocument(path.join(args.corpus, name));
    for (const program of doc.fonts) {
      programsTotal += 1;
      referencesTotal += 1;
      if (program.program !== 'parsed') continue;
      programsParsed += 1;
      const family = resolveTwin(manifest, program.baseFont);
      if (!family) continue;
      programsWithTwin += 1;
      referencesWithTwin += 1;
      documentsWithTwin.add(name);

      const drifts = [];
      const wordDrifts = [];
      const original = program.fontkitFont;
      if (!original) continue;
      const attributes = fontAttributesOf(program.baseFont);
      for (const subset of family.subsets) {
        const twin = await getTwin(family, subset, attributes.weight, attributes.style);
        if (!twin) {
          missingSlices.add(`${family.id}-${subset}`);
          continue;
        }
        for (const ch of PROBE_ALPHABET) {
          const cp = ch.codePointAt(0);
          const twinAdvance = advanceOf(twin, cp);
          // The original program is only reachable through its cmap; without one there is nothing to
          // compare (that is exactly the population wave 2 exists for).
          const originalAdvance = advanceOf(original, cp);
          if (twinAdvance === null || originalAdvance === null || originalAdvance === 0) continue;
          drifts.push(Math.abs(twinAdvance - originalAdvance) / originalAdvance);
        }
        for (const word of PROBE_WORDS) {
          let twinTotal = 0;
          let originalTotal = 0;
          let comparable = true;
          for (const ch of word) {
            const cp = ch.codePointAt(0);
            const twinAdvance = advanceOf(twin, cp);
            const originalAdvance = advanceOf(original, cp);
            if (twinAdvance === null || originalAdvance === null) {
              comparable = false;
              break;
            }
            twinTotal += twinAdvance;
            originalTotal += originalAdvance;
          }
          if (comparable && originalTotal > 0) {
            wordDrifts.push(Math.abs(twinTotal - originalTotal) / originalTotal);
          }
        }
      }
      if (drifts.length === 0) continue;
      programsCompared += 1;
      drifts.sort((a, b) => a - b);
      const stats = {
        n: drifts.length,
        median: quantile(drifts, 0.5),
        p90: quantile(drifts, 0.9),
        max: drifts[drifts.length - 1],
      };
      const bucket = perTwin.get(family.id) ?? { family: family.label, programs: 0, drifts: [], wordDrifts: [] };
      bucket.programs += 1;
      bucket.drifts.push(...drifts);
      bucket.wordDrifts.push(...wordDrifts);
      perTwin.set(family.id, bucket);

      const pairKey = `${normalize(program.baseFont)}→${family.id}`;
      const pair = perPair.get(pairKey) ?? { pair: `${program.family ?? program.baseFont} → ${family.label}`, programs: 0, drifts: [], wordDrifts: [] };
      pair.programs += 1;
      pair.drifts.push(...drifts);
      pair.wordDrifts.push(...wordDrifts);
      perPair.set(pairKey, pair);
      void stats;
    }
    log(`  ${name.padEnd(34)} refs=${String(doc.fonts.length).padStart(3)}`);
  }

  const summarise = (bucket) => {
    const sorted = [...bucket.drifts].sort((a, b) => a - b);
    const words = [...(bucket.wordDrifts ?? [])].sort((a, b) => a - b);
    const within1pct = sorted.filter((value) => value <= 0.01).length / Math.max(sorted.length, 1);
    const wordsWithin1pct = words.filter((value) => value <= 0.01).length / Math.max(words.length, 1);
    return {
      programs: bucket.programs,
      chars: bucket.drifts.length,
      // A layout is safe when the advance widths agree; single characters that disagree are usually a
      // subset whose cmap points at a differently-shaped glyph, which says nothing about the twin.
      shareCharsWithin1pct: round(within1pct),
      shareWordsWithin1pct: round(wordsWithin1pct),
      medianDrift: round(quantile(sorted, 0.5), 5),
      p90Drift: round(quantile(sorted, 0.9), 5),
      maxDrift: round(sorted[sorted.length - 1], 5),
      wordMedianDrift: round(quantile(words, 0.5), 5),
      wordP90Drift: round(quantile(words, 0.9), 5),
      wordMaxDrift: round(words[words.length - 1], 5),
    };
  };

  const report = {
    generatedAt: new Date().toISOString(),
    corpus: path.relative(ROOT, args.corpus),
    corpusFiles: files.length,
    fonts: {
      references: referencesTotal,
      parsedPrograms: programsParsed,
      withTwin: programsWithTwin,
      compared: programsCompared,
      referencesWithTwin,
      shareOfReferencesWithTwin: round(referencesWithTwin / Math.max(referencesTotal, 1)),
      documentsWithTwin: [...documentsWithTwin].length,
      missingSlices: [...missingSlices].sort(),
    },
    probeAlphabet: PROBE_ALPHABET,
    driftDefinition: '|twinAdvance - originalAdvance| / originalAdvance, per character advance in units-per-em; characters absent from either face are skipped',
    byTwin: [...perTwin].map(([id, bucket]) => ({ id, family: bucket.family, ...summarise(bucket) })),
    byPair: [...perPair].map(([id, bucket]) => ({ id, pair: bucket.pair, ...summarise(bucket) })),
  };

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('');
  console.log(`fonts        ${report.fonts.references} refs, ${report.fonts.parsedPrograms} parsed programs, ${report.fonts.withTwin} map to a twin, ${report.fonts.compared} comparable`);
  console.log(`coverage     ${(report.fonts.shareOfReferencesWithTwin * 100).toFixed(1)}% of references map to a twin; ${report.fonts.documentsWithTwin}/${files.length} documents at least one`);
  console.log('');
  console.log('advance-width drift per twin (0 = identical metrics)');
  for (const twin of report.byTwin) {
    console.log(`  ${twin.id.padEnd(9)} programs=${String(twin.programs).padStart(3)}  words within 1%: ${(twin.shareWordsWithin1pct * 100).toFixed(1)}%  word median ${(twin.wordMedianDrift * 100).toFixed(2)}%  p90 ${(twin.wordP90Drift * 100).toFixed(2)}%  chars within 1%: ${(twin.shareCharsWithin1pct * 100).toFixed(1)}%`);
  }
  console.log('');
  console.log('per original face');
  for (const pair of report.byPair.sort((a, b) => b.programs - a.programs).slice(0, 12)) {
    console.log(`  ${pair.pair.padEnd(34)} n=${String(pair.programs).padStart(3)}  words within 1%: ${(pair.shareWordsWithin1pct * 100).toFixed(1)}%  word median ${(pair.wordMedianDrift * 100).toFixed(2)}%`);
  }
  if (report.fonts.missingSlices.length > 0) {
    console.log(`\nmissing slices (fall through to the old fallback): ${report.fonts.missingSlices.join(', ')}`);
  }
  console.log(`\nreport -> ${path.relative(ROOT, args.out)}`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
