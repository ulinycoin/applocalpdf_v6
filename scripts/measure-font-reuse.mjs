#!/usr/bin/env node
/**
 * Wave 0, task 0.2 — how often can an edit reuse the font that is already embedded?
 *
 * The product question: after this work, how often is edited text drawn in the *original* face
 * instead of Helvetica/Roboto/PNG? Three things are measured separately because they get conflated:
 *
 *   1. parse rate   — can @pdf-lib/fontkit read the embedded program at all;
 *   2. coverage     — which characters that program can actually encode;
 *   3. edit success — does a realistic new string survive the coverage gate.
 *
 * Coverage is checked ONLY through `hasGlyphForCodePoint` / glyph id 0: `.notdef` frequently has a
 * non-zero width, so `widthOfTextAtSize(ch) > 0` is not a coverage test.
 *
 * Two reuse paths are reported, because the corpus says they behave very differently:
 *
 *   `cmap` — re-embed the program and let pdf-lib build a fresh encoding (`embedFont` + `encodeText`).
 *            Requires the program to carry a character map. This is what wave 1 can do.
 *   `cid`  — emit two-byte codes ourselves, learning Unicode→CID from the PDF's own `/ToUnicode`
 *            CMap (Identity CIDToGIDMap). Never needs a cmap in the program. This is wave 2's spike.
 *
 * The gap between the two is the finding of wave 0: a large share of embedded subsets parse fine but
 * have no ASCII in their cmap, so wave 1 alone cannot reuse them — and that is a property of the file,
 * not of the code.
 *
 * The extraction here is deliberately standalone so the baseline exists before any production code.
 * Wave 1 moves it into `src/services/pdf/text-edit/font-program.ts`; this script should then import
 * that module instead of keeping a second copy of the parsing rules.
 *
 * Usage:
 *   node scripts/measure-font-reuse.mjs [--corpus <dir>] [--out <file>] [--details <file>] [--quiet]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_CORPUS = path.join(ROOT, 'test/fixtures/font-corpus');
// `test-results/` is gitignored, so the baseline that gates wave 1 lives beside the other pinned
// fixtures instead. A run against a scratch corpus can still be written elsewhere with --out.
const DEFAULT_OUT = path.join(ROOT, 'test/fixtures/font-reuse-baseline.json');

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const BASE62 = LETTERS + DIGITS;

/** Replacement strings an editor realistically produces. */
const SCENARIOS = [
  { key: 'singleAsciiChar', label: 'replace 1 character with an arbitrary letter or digit', strings: [...BASE62] },
  { key: 'wordAscii', label: 'replace a whole word, ASCII', strings: ['Invoice', 'Contract', 'Payment', 'Total', '2026', 'Signature', 'Address', 'Name', 'Date', 'Price'] },
  { key: 'wordLatvian', label: 'replace a whole word, Latvian diacritics', strings: ['Rēķins', 'Rīga', 'Jelgava', 'Samaksa', 'Adrese', 'Paraksts', 'Līgums', 'Diena'] },
  { key: 'wordCyrillic', label: 'type non-Latin text (Cyrillic)', strings: ['Привет', 'Договор', 'Оплата', 'Адрес', 'Подпись'] },
];

const FONT_FILE_KEYS = ['FontFile', 'FontFile2', 'FontFile3'];
const FONT_FILE3_FORMATS = { OpenType: 'opentype', Type1C: 'cff', CIDFontType0C: 'cff' };
const MODES = ['cmap', 'cid'];

function parseArgs(argv) {
  const args = { corpus: DEFAULT_CORPUS, out: DEFAULT_OUT, details: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--quiet') args.quiet = true;
    else if (arg === '--corpus') args.corpus = path.resolve(argv[++i]);
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--details') args.details = path.resolve(argv[++i]);
    else if (arg.startsWith('--corpus=')) args.corpus = path.resolve(arg.slice(9));
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.slice(6));
    else if (arg.startsWith('--details=')) args.details = path.resolve(arg.slice(10));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

const nameOf = (value) => {
  if (!value) return undefined;
  const text = value.toString();
  return text.startsWith('/') ? text.slice(1) : text;
};

const stripSubsetPrefix = (name) => (name ?? '').replace(/^[A-Z]{6}\+/u, '');

function dictOf(ctx, value) {
  if (!value) return undefined;
  try {
    return ctx.lookup(value, PDFDict) ?? undefined;
  } catch {
    return undefined;
  }
}

function arrayOf(ctx, value) {
  if (!value) return undefined;
  try {
    const resolved = ctx.lookup(value, PDFArray);
    if (resolved) return resolved;
  } catch {
    // A direct array is not a ref and lookup refuses it.
  }
  return value instanceof PDFArray ? value : undefined;
}

function filtersOf(ctx, dict) {
  const raw = dict.get(PDFName.of('Filter'));
  if (!raw) return [];
  const array = arrayOf(ctx, raw);
  const items = array ? array.asArray() : [raw];
  return items.map((item) => nameOf(ctx.lookup(item) ?? item)).filter(Boolean);
}

function decodeStream(ctx, streamRef) {
  const stream = ctx.lookup(streamRef, PDFRawStream);
  if (!stream) return { bytes: null, reason: 'stream-missing' };
  let bytes = stream.getContents();
  for (const filter of filtersOf(ctx, stream.dict)) {
    if (filter === 'FlateDecode' || filter === 'Fl') {
      try {
        bytes = inflateSync(bytes);
      } catch (error) {
        return { bytes: null, reason: `flate: ${error.message}` };
      }
    } else if (filter === 'ASCIIHexDecode' || filter === 'AHx') {
      const text = Buffer.from(bytes).toString('latin1').replace(/>.*$/su, '');
      const hex = text.replace(/[^0-9a-fA-F]/gu, '');
      bytes = Buffer.from(hex.length % 2 === 0 ? hex : `${hex}0`, 'hex');
    } else {
      return { bytes: null, reason: `filter ${filter}` };
    }
  }
  return { bytes, reason: null };
}

/**
 * Character codes reachable through the PDF's own /ToUnicode CMap.
 *
 * For an Identity-H composite font the codes in the stream are CIDs, and this CMap is the only
 * record of which Unicode characters those CIDs stand for — the embedded program need not carry a
 * usable cmap at all. Multi-character destinations (ligatures) are skipped: they cannot be typed.
 */
function parseToUnicodeCmap(text) {
  const chars = new Set();
  const codeLengths = new Set();
  let multiCharMappings = 0;

  const utf16 = (hex) => {
    let out = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    }
    return out;
  };
  const note = (dst) => {
    const points = [...dst];
    if (points.length === 1) chars.add(points[0].codePointAt(0));
    else if (points.length > 1) multiCharMappings += 1;
  };

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/gu)) {
      codeLengths.add(pair[1].length / 2);
      note(utf16(pair[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu)) {
    const body = block[1];
    for (const range of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([\s\S]*?)\])/gu)) {
      codeLengths.add(range[1].length / 2);
      if (range[3]) {
        const start = parseInt(range[3].slice(0, 4), 16);
        const count = parseInt(range[2], 16) - parseInt(range[1], 16);
        for (let offset = 0; offset <= count && offset < 65_536; offset += 1) {
          chars.add(start + offset);
        }
      } else if (range[4]) {
        for (const dst of range[4].matchAll(/<([0-9a-fA-F]+)>/gu)) {
          note(utf16(dst[1]));
        }
      }
    }
  }
  return { chars, codeLengths: [...codeLengths], multiCharMappings };
}

function coverageOfSet(chars, charsToTest) {
  let covered = 0;
  for (const ch of charsToTest) {
    if (chars.has(ch.codePointAt(0))) covered += 1;
  }
  return covered / charsToTest.length;
}

function coverageOfFont(font, charsToTest) {
  let covered = 0;
  for (const ch of charsToTest) {
    const cp = ch.codePointAt(0);
    let present = false;
    try {
      present = typeof font.hasGlyphForCodePoint === 'function'
        ? font.hasGlyphForCodePoint(cp)
        : Boolean(font.glyphForCodePoint(cp)?.id);
    } catch {
      present = false;
    }
    if (present) covered += 1;
  }
  return covered / charsToTest.length;
}

function scenarioRates(hasChar) {
  const rates = {};
  for (const scenario of SCENARIOS) {
    const hits = scenario.strings.filter((text) => [...text].every((ch) => hasChar(ch.codePointAt(0)))).length;
    rates[scenario.key] = hits / scenario.strings.length;
  }
  return rates;
}

function readFsType(font) {
  try {
    const value = font['OS/2']?.fsType;
    return typeof value === 'number' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** OS/2 embedding bits that make reuse a licence problem rather than a bug. */
function isRestrictedEmbedding(fsType) {
  if (typeof fsType !== 'number') return false;
  return (fsType & 0x0002) !== 0 || (fsType & 0x0004) !== 0 || (fsType & 0x0200) !== 0;
}

const EMPTY_RATES = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.key, 0]));

/**
 * One font reference from a page resource dictionary, resolved into everything the reuse decision
 * needs: is there a program, does it parse, what can each of the two paths encode, may it be reused.
 *
 * Parsing is memoised by font-file object number: the same program is referenced hundreds of times
 * across pages and documents, and fontkit parsing dominates the run time.
 */
function inspectFont(ctx, fontDict, resourceName, fontRef, cache) {
  const subtype = nameOf(fontDict.get(PDFName.of('Subtype')));
  const baseFont = nameOf(fontDict.get(PDFName.of('BaseFont')));
  const entry = {
    resourceName,
    subtype,
    baseFont,
    family: stripSubsetPrefix(baseFont),
    objectNumber: fontRef?.objectNumber ?? null,
    program: 'none',
    modes: { cmap: { coverage62: 0, coverageLetters: 0, scenarios: { ...EMPTY_RATES } }, cid: { coverage62: 0, coverageLetters: 0, scenarios: { ...EMPTY_RATES } } },
  };

  if (subtype === 'Type3') {
    entry.program = 'type3';
    return entry;
  }

  const descendant = subtype === 'Type0'
    ? dictOf(ctx, arrayOf(ctx, fontDict.get(PDFName.of('DescendantFonts')))?.asArray()?.[0])
    : undefined;
  const descriptorOwner = descendant ?? fontDict;
  entry.descendantSubtype = descendant ? nameOf(descendant.get(PDFName.of('Subtype'))) : undefined;
  if (descendant) {
    entry.cidToGidMap = nameOf(descendant.get(PDFName.of('CIDToGIDMap'))) ?? 'stream';
  }

  const descriptor = dictOf(ctx, descriptorOwner.get(PDFName.of('FontDescriptor')));
  if (!descriptor) {
    // The standard 14 fonts carry no descriptor at all: nothing is embedded, nothing to reuse.
    entry.program = 'no-descriptor';
    return entry;
  }

  const fileRef = FONT_FILE_KEYS.map((key) => ({ key, ref: descriptor.get(PDFName.of(key)) })).find((item) => item.ref);
  if (!fileRef) {
    entry.program = 'no-fontfile';
    return entry;
  }
  entry.fontFileKey = fileRef.key;

  const cacheKey = `${fileRef.ref?.objectNumber ?? 'direct'}:${fileRef.key}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    entry.fontkitFont = cached.fontkitFont;
    entry.program = cached.program;
    entry.programError = cached.programError;
    entry.programSha = cached.programSha;
    entry.programBytes = cached.programBytes;
    entry.format = cached.format;
    entry.numGlyphs = cached.numGlyphs;
    entry.fsType = cached.fsType;
    entry.hasToUnicode = cached.hasToUnicode;
    entry.toUnicodeMultiChar = cached.toUnicodeMultiChar;
    entry.modes = cached.modes;
    return entry;
  }

  const decoded = decodeStream(ctx, fileRef.ref);
  if (!decoded.bytes || decoded.bytes.length === 0) {
    entry.program = 'decode-failed';
    entry.programError = decoded.reason;
    return entry;
  }
  entry.programBytes = decoded.bytes.length;
  entry.programSha = createHash('sha1').update(decoded.bytes).digest('hex');
  if (fileRef.key === 'FontFile3') {
    const stream = ctx.lookup(fileRef.ref, PDFRawStream);
    entry.format = FONT_FILE3_FORMATS[nameOf(ctx.lookup(stream?.dict.get(PDFName.of('Subtype'))))] ?? 'unknown';
  } else {
    entry.format = fileRef.key === 'FontFile2' ? 'truetype' : 'type1';
  }

  // Path 2: Unicode→CID from the file's own ToUnicode, independent of the program's cmap.
  const toUnicodeRef = fontDict.get(PDFName.of('ToUnicode'));
  if (toUnicodeRef) {
    const cmapBytes = decodeStream(ctx, toUnicodeRef);
    if (cmapBytes.bytes) {
      const parsed = parseToUnicodeCmap(Buffer.from(cmapBytes.bytes).toString('latin1'));
      entry.hasToUnicode = true;
      entry.toUnicodeMultiChar = parsed.multiCharMappings;
      entry.toUnicodeCodes = parsed.codeLengths.join('/');
      entry.modes.cid.coverage62 = coverageOfSet(parsed.chars, BASE62);
      entry.modes.cid.coverageLetters = coverageOfSet(parsed.chars, LETTERS);
      entry.modes.cid.scenarios = scenarioRates((cp) => parsed.chars.has(cp));
    }
  }

  try {
    const font = fontkit.create(Buffer.from(decoded.bytes));
    entry.program = 'parsed';
    // Layout comparisons (scripts/measure-metric-twins.mjs) need the live font object; it is not
    // serialised and never reaches the baseline JSON.
    entry.fontkitFont = font;
    entry.numGlyphs = font.numGlyphs;
    entry.fsType = readFsType(font);
    entry.modes.cmap.coverage62 = coverageOfFont(font, BASE62);
    entry.modes.cmap.coverageLetters = coverageOfFont(font, LETTERS);
    entry.modes.cmap.scenarios = scenarioRates((cp) => {
      try {
        return typeof font.hasGlyphForCodePoint === 'function' ? font.hasGlyphForCodePoint(cp) : Boolean(font.glyphForCodePoint(cp)?.id);
      } catch {
        return false;
      }
    });
  } catch (error) {
    entry.program = 'parse-failed';
    entry.programError = String(error.message).split('\n')[0];
  }

  cache.set(cacheKey, {
    program: entry.program,
    programError: entry.programError,
    programSha: entry.programSha,
    programBytes: entry.programBytes,
    format: entry.format,
    numGlyphs: entry.numGlyphs,
    fsType: entry.fsType,
    hasToUnicode: entry.hasToUnicode,
    toUnicodeMultiChar: entry.toUnicodeMultiChar,
    modes: entry.modes,
  });
  return entry;
}

function pageFontDicts(ctx, page) {
  let node = page.node;
  for (let depth = 0; node && depth < 8; depth += 1) {
    const resources = dictOf(ctx, node.get(PDFName.of('Resources')));
    const fonts = resources ? dictOf(ctx, resources.get(PDFName.of('Font'))) : undefined;
    if (fonts) return fonts;
    node = node.get(PDFName.of('Parent')) ? dictOf(ctx, node.get(PDFName.of('Parent'))) : undefined;
  }
  return undefined;
}

async function scanDocument(file, cache = new Map()) {
  const bytes = await fs.readFile(file);
  const doc = { file: path.basename(file), size: bytes.length, pages: 0, fonts: [], loadError: null, encrypted: false };
  let pdf;
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false, ignoreEncryption: true });
  } catch (error) {
    doc.loadError = String(error.message).split('\n')[0];
    return doc;
  }
  const ctx = pdf.context;
  doc.pages = pdf.getPageCount();
  /**
   * Streams of an encrypted document are still encrypted — `ignoreEncryption` only stops the throw, it
   * does not decrypt. Extraction here would read noise, so the document is recorded as "encrypted" and
   * excluded from program statistics; the product unlocks such files before editing, and measuring that
   * path belongs to the protect/unlock tool, not to font reuse.
   */
  if (pdf.isEncrypted || Boolean(ctx.trailerInfo?.Encrypt)) {
    doc.encrypted = true;
    return doc;
  }

  for (const [pageIndex, page] of pdf.getPages().entries()) {
    const fonts = pageFontDicts(ctx, page);
    if (!fonts) continue;
    for (const key of fonts.keys()) {
      const fontRef = fonts.get(key);
      const fontDict = dictOf(ctx, fontRef);
      if (!fontDict) continue;
      let entry;
      try {
        entry = inspectFont(ctx, fontDict, nameOf(key), fontRef, cache);
      } catch (error) {
        entry = { resourceName: nameOf(key), program: 'inspect-failed', programError: String(error.message).split('\n')[0], modes: { cmap: { coverage62: 0, scenarios: { ...EMPTY_RATES } }, cid: { coverage62: 0, scenarios: { ...EMPTY_RATES } } } };
      }
      doc.fonts.push({ ...entry, pageIndex });
    }
  }
  return doc;
}

// ---------------------------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------------------------

const round = (value, digits = 4) => (typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : value);
const mean = (values) => (values.length === 0 ? null : round(values.reduce((acc, value) => acc + value, 0) / values.length));

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function describe(values) {
  if (values.length === 0) return { n: 0, mean: null, median: null, p10: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: mean(sorted),
    median: round(quantile(sorted, 0.5)),
    p10: round(quantile(sorted, 0.1)),
    p90: round(quantile(sorted, 0.9)),
  };
}

function subtypeBucket(entry) {
  if (entry.subtype === 'Type0') {
    return entry.descendantSubtype === 'CIDFontType0' ? 'Type0/CFF' : 'Type0/TrueType';
  }
  return entry.subtype ?? 'unknown';
}

// Program-less entries (Type3, non-embedded, undecodable) still differ per object: keying them by name
// alone collapsed 40 distinct Type3 fonts into a single "program" and skewed every mean.
const programKey = (entry) => entry.programSha ?? `ref:${entry.objectNumber ?? '?'}:${entry.program}:${entry.family ?? '?'}`;

function countBy(items, pick) {
  return items.reduce((acc, item) => {
    const key = pick(item) ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * Corpus categories come from the manifest `fetch-font-corpus.mjs` writes. Without it the report is
 * still valid, just less readable: a median of 0% only makes sense next to "which kind of file".
 */
async function readCategories(corpusDir, files) {
  const categories = new Map();
  const add = (category, file) => {
    if (!categories.has(category)) categories.set(category, new Set());
    categories.get(category).add(file);
  };
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(corpusDir, 'manifest.json'), 'utf8'));
    for (const entry of manifest.entries ?? []) {
      add(entry.category ?? 'unknown', entry.file);
    }
  } catch {
    // No manifest: one bucket for everything.
  }
  for (const file of files) {
    if (![...categories.values()].some((names) => names.has(file))) add('unknown', file);
  }
  return [...categories].sort(([a], [b]) => a.localeCompare(b));
}

/** Scenario success for the dominant font of a document under one reuse path. */
function topRatesOf(doc, mode, key) {
  const top = topFontOf(doc);
  if (!top || top.program !== 'parsed') return 0;
  const entry = doc.fonts.find((font) => (font.family ?? font.resourceName) === top.family);
  return entry ? entry.modes[mode].scenarios[key] : 0;
}

/** Font with the most references in a document, with the reuse rate each path would give it. */
function topFontOf(doc) {
  const counts = new Map();
  for (const font of doc.fonts) {
    const key = font.family ?? font.resourceName ?? '?';
    const current = counts.get(key) ?? { family: key, subtype: font.subtype, program: font.program, occurrences: 0, entry: font };
    current.occurrences += 1;
    counts.set(key, current);
  }
  const top = [...counts.values()].sort((a, b) => b.occurrences - a.occurrences)[0];
  if (!top) return null;
  const { entry } = top;
  const scenario = (mode, key) => (entry.program === 'parsed' ? entry.modes[mode].scenarios[key] : 0);
  return {
    family: top.family,
    subtype: top.subtype,
    program: top.program,
    occurrences: top.occurrences,
    editSuccess: {
      singleAsciiChar: {
        cmap: scenario('cmap', 'singleAsciiChar'),
        cid: scenario('cid', 'singleAsciiChar'),
        best: Math.max(scenario('cmap', 'singleAsciiChar'), scenario('cid', 'singleAsciiChar')),
      },
      wordLatvian: {
        cmap: scenario('cmap', 'wordLatvian'),
        cid: scenario('cid', 'wordLatvian'),
        best: Math.max(scenario('cmap', 'wordLatvian'), scenario('cid', 'wordLatvian')),
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = args.quiet ? () => {} : (...parts) => console.log(...parts);

  const files = (await fs.readdir(args.corpus)).filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
  if (files.length === 0) {
    throw new Error(`no PDFs in ${args.corpus} — run scripts/fetch-font-corpus.mjs first`);
  }
  log(`corpus: ${files.length} files in ${path.relative(ROOT, args.corpus)}`);

  const cache = new Map();
  const documents = [];
  for (const name of files) {
    const doc = await scanDocument(path.join(args.corpus, name), cache);
    documents.push(doc);
    log(`  ${name.padEnd(34)} pages=${String(doc.pages).padStart(3)} fonts=${String(doc.fonts.length).padStart(4)}${doc.loadError ? ' LOAD-FAIL' : ''}`);
  }

  const occurrences = documents.flatMap((doc) => doc.fonts.map((font) => ({ ...font, file: doc.file })));
  const byProgram = new Map();
  for (const entry of occurrences) {
    const key = programKey(entry);
    if (!byProgram.has(key)) byProgram.set(key, { ...entry, occurrences: 0, files: new Set() });
    const bucket = byProgram.get(key);
    bucket.occurrences += 1;
    bucket.files.add(entry.file);
  }
  const programs = [...byProgram.values()].map((entry) => ({ ...entry, files: [...entry.files] }));

  const withProgram = programs.filter((entry) => entry.program !== 'type3' && entry.program !== 'no-descriptor');
  const parsed = withProgram.filter((entry) => entry.program === 'parsed');
  const parseFailures = withProgram.filter((entry) => entry.program !== 'parsed');

  const parseBySubtype = {};
  for (const bucket of new Set(withProgram.map(subtypeBucket))) {
    const inBucket = withProgram.filter((entry) => subtypeBucket(entry) === bucket);
    const ok = inBucket.filter((entry) => entry.program === 'parsed');
    parseBySubtype[bucket] = {
      programs: inBucket.length,
      parsed: ok.length,
      parseRate: round(ok.length / inBucket.length),
      failureReasons: countBy(inBucket.filter((entry) => entry.program !== 'parsed'), (entry) => entry.program),
    };
  }

  const modesReport = {};
  for (const mode of MODES) {
    const coverageBySubtype = {};
    for (const bucket of new Set(parsed.map(subtypeBucket))) {
      coverageBySubtype[bucket] = describe(parsed.filter((entry) => subtypeBucket(entry) === bucket).map((entry) => entry.modes[mode].coverage62));
    }
    const scenarios = SCENARIOS.map((scenario) => {
      const perProgram = programs.map((entry) => (entry.program === 'parsed' ? entry.modes[mode].scenarios[scenario.key] : 0));
      const bySubtype = {};
      for (const bucket of new Set(programs.map(subtypeBucket))) {
        bySubtype[bucket] = describe(programs.filter((entry) => subtypeBucket(entry) === bucket)
          .map((entry) => (entry.program === 'parsed' ? entry.modes[mode].scenarios[scenario.key] : 0)));
      }
      return {
        key: scenario.key,
        label: scenario.label,
        stringsTested: scenario.strings.length,
        editInstances: programs.length * scenario.strings.length,
        meanOverPrograms: mean(perProgram),
        occurrenceWeighted: round(occurrences.reduce((acc, entry) => acc + (entry.program === 'parsed' ? entry.modes[mode].scenarios[scenario.key] : 0), 0) / occurrences.length),
        distribution: describe(perProgram),
        bySubtype,
      };
    });
    modesReport[mode] = {
      coverage: {
        base62: describe(parsed.map((entry) => entry.modes[mode].coverage62)),
        letters: describe(parsed.map((entry) => entry.modes[mode].coverageLetters)),
        bySubtype: coverageBySubtype,
      },
      scenarios,
      productivePrograms: parsed.filter((entry) => entry.modes[mode].coverage62 > 0).length,
    };
  }

  // The two paths are independent: a file may be reusable through CIDs while its program has no cmap,
  // and vice versa. `best` is the ceiling if both are implemented.
  const best = SCENARIOS.map((scenario) => {
    const perProgram = programs.map((entry) => {
      if (entry.program !== 'parsed') return 0;
      return Math.max(entry.modes.cmap.scenarios[scenario.key], entry.modes.cid.scenarios[scenario.key]);
    });
    return { key: scenario.key, meanOverPrograms: mean(perProgram), distribution: describe(perProgram) };
  });

  /**
   * Document-level success, the number that matches what a user experiences: open one file, try to
   * edit the font that carries most of its text. Programs are the wrong denominator — a Chrome CJK
   * page emits one Type3 font per glyph batch, so a single document can contribute forty "programs"
   * that all fail, while a user only ever sees one document.
   * Documents with no text at all (scans) are excluded: there is nothing to edit until OCR runs.
   */
  const textDocuments = documents.filter((doc) => doc.fonts.length > 0);
  const documentLevel = MODES.map((mode) => {
    const rate = (key) => mean(textDocuments.map((doc) => {
      const top = topFontOf(doc);
      if (!top || top.program !== 'parsed') return 0;
      const entry = doc.fonts.find((font) => (font.family ?? font.resourceName) === top.family);
      return entry ? entry.modes[mode].scenarios[key] : 0;
    }));
    return {
      mode,
      documents: textDocuments.length,
      singleAsciiChar: rate('singleAsciiChar'),
      wordAscii: rate('wordAscii'),
      wordLatvian: rate('wordLatvian'),
      wordCyrillic: rate('wordCyrillic'),
      documentsWithAnyReusableFont: round(textDocuments.filter((doc) => doc.fonts.some((font) => font.program === 'parsed' && font.modes[mode].coverage62 > 0)).length / textDocuments.length),
    };
  });
  /**
   * Split out the documents whose dominant font is actually embedded: only there does the current
   * fallback visibly change the typeface. A non-embedded Helvetica/Arial is already drawn by the
   * viewer from its own resources, so "reuse failed" for those costs almost nothing visually.
   */
  const embeddedDominantDocuments = textDocuments.filter((doc) => {
    const top = topFontOf(doc);
    return Boolean(top) && ['parsed', 'parse-failed', 'decode-failed'].includes(top.program);
  });
  const embeddedDominant = {
    documents: embeddedDominantDocuments.length,
    byPath: MODES.map((mode) => ({
      mode,
      singleAsciiChar: mean(embeddedDominantDocuments.map((doc) => topRatesOf(doc, mode, 'singleAsciiChar'))),
      wordAscii: mean(embeddedDominantDocuments.map((doc) => topRatesOf(doc, mode, 'wordAscii'))),
      wordLatvian: mean(embeddedDominantDocuments.map((doc) => topRatesOf(doc, mode, 'wordLatvian'))),
      wordCyrillic: mean(embeddedDominantDocuments.map((doc) => topRatesOf(doc, mode, 'wordCyrillic'))),
    })),
  };
  const embeddedDominantBest = (key) => mean(embeddedDominantDocuments.map((doc) => {
    const top = topFontOf(doc);
    if (!top || top.program !== 'parsed') return 0;
    const entry = doc.fonts.find((font) => (font.family ?? font.resourceName) === top.family);
    return entry ? Math.max(entry.modes.cmap.scenarios[key], entry.modes.cid.scenarios[key]) : 0;
  }));

  const documentLevelBest = (key) => mean(textDocuments.map((doc) => {
    const top = topFontOf(doc);
    if (!top || top.program !== 'parsed') return 0;
    const entry = doc.fonts.find((font) => (font.family ?? font.resourceName) === top.family);
    return entry ? Math.max(entry.modes.cmap.scenarios[key], entry.modes.cid.scenarios[key]) : 0;
  }));

  const categories = await readCategories(args.corpus, files);
  const byCategory = {};
  for (const [category, names] of categories) {
    const inCategory = programs.filter((entry) => entry.files.some((file) => names.has(file)));
    const parsedInCategory = inCategory.filter((entry) => entry.program === 'parsed');
    const rate = (mode, key) => mean(parsedInCategory.map((entry) => entry.modes[mode].scenarios[key])) ?? null;
    const bestRate = (key) => mean(parsedInCategory.map((entry) => Math.max(entry.modes.cmap.scenarios[key], entry.modes.cid.scenarios[key]))) ?? null;
    const docsInCategory = textDocuments.filter((doc) => names.has(doc.file));
    const docBest = (key) => mean(docsInCategory.map((doc) => {
      const top = topFontOf(doc);
      if (!top || top.program !== 'parsed') return 0;
      return Math.max(top.editSuccess[key].cmap, top.editSuccess[key].cid);
    }));
    const docPath = (mode, key) => mean(docsInCategory.map((doc) => {
      const top = topFontOf(doc);
      return top ? top.editSuccess[key][mode] : 0;
    }));
    byCategory[category] = {
      files: names.size,
      documentsWithText: docsInCategory.length,
      programs: inCategory.length,
      parsed: parsedInCategory.length,
      medianCoverage: {
        cmap: describe(parsedInCategory.map((entry) => entry.modes.cmap.coverage62)).median,
        cid: describe(parsedInCategory.map((entry) => entry.modes.cid.coverage62)).median,
      },
      // Per program: equal weight for every embedded program in the category.
      editSuccess: {
        singleAsciiChar: { cmap: rate('cmap', 'singleAsciiChar'), cid: rate('cid', 'singleAsciiChar'), best: bestRate('singleAsciiChar') },
        wordLatvian: { cmap: rate('cmap', 'wordLatvian'), cid: rate('cid', 'wordLatvian'), best: bestRate('wordLatvian') },
      },
      // Per document: equal weight for every file, dominant font only — the user-facing view.
      documentLevel: {
        singleAsciiChar: { cmap: docPath('cmap', 'singleAsciiChar'), cid: docPath('cid', 'singleAsciiChar'), best: docBest('singleAsciiChar') },
        wordLatvian: { cmap: docPath('cmap', 'wordLatvian'), cid: docPath('cid', 'wordLatvian'), best: docBest('wordLatvian') },
      },
    };
  }

  const cmapZeroCidPositive = parsed.filter((entry) => entry.modes.cmap.coverage62 === 0 && entry.modes.cid.coverage62 > 0);
  const cmapSuspicious = parsed.filter((entry) => entry.modes.cmap.coverage62 === 0 && entry.modes.cid.coverage62 === 0 && (entry.numGlyphs ?? 0) > 4);

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    git: readGitState(),
    measurement: {
      coverageRule: 'hasGlyphForCodePoint (cmap path) / PDF ToUnicode CMap (cid path); never widthOfTextAtSize()',
      paths: {
        cmap: 're-embed the program and encode through pdf-lib: needs a character map inside the program (wave 1)',
        cid: 'write two-byte codes, Unicode→CID from the PDF /ToUnicode: needs /ToUnicode and /CIDToGIDMap /Identity (wave 2)',
      },
    },
    corpus: {
      dir: path.relative(ROOT, args.corpus),
      files: files.length,
      bytes: documents.reduce((acc, doc) => acc + doc.size, 0),
      pages: documents.reduce((acc, doc) => acc + doc.pages, 0),
      documentLoadFailures: documents.filter((doc) => doc.loadError).map((doc) => ({ file: doc.file, error: doc.loadError })),
      encryptedDocuments: documents.filter((doc) => doc.encrypted).map((doc) => doc.file),
    },
    fonts: {
      occurrences: occurrences.length,
      uniquePrograms: programs.length,
      withProgram: withProgram.length,
      parsed: parsed.length,
      parseFailed: parseFailures.length,
      parseRate: round(parsed.length / Math.max(withProgram.length, 1)),
      notReusable: {
        type3: programs.filter((entry) => entry.program === 'type3').length,
        noDescriptor: programs.filter((entry) => entry.program === 'no-descriptor').length,
        noFontFile: programs.filter((entry) => entry.program === 'no-fontfile').length,
        decodeFailed: programs.filter((entry) => entry.program === 'decode-failed').length,
        inspectFailed: programs.filter((entry) => entry.program === 'inspect-failed').length,
      },
      failureReasons: countBy(parseFailures, (entry) => entry.program),
      failureSamples: parseFailures.slice(0, 8).map((entry) => ({ family: entry.family, subtype: entry.subtype, reason: entry.programError })),
      bySubtype: parseBySubtype,
      formats: countBy(parsed, (entry) => entry.format),
      withToUnicode: parsed.filter((entry) => entry.hasToUnicode).length,
      identityCidToGid: parsed.filter((entry) => entry.cidToGidMap === 'Identity').length,
      restrictedEmbedding: parsed.filter((entry) => isRestrictedEmbedding(entry.fsType)).length,
      parseFailedWithToUnicode: parseFailures.filter((entry) => entry.hasToUnicode).length,
      cmapDeadButCidAlive: {
        count: cmapZeroCidPositive.length,
        note: 'Program parses but carries no ASCII cmap, while /ToUnicode knows the characters: wave 1 sees zero coverage here, wave 2 can still edit them.',
        families: cmapZeroCidPositive.slice(0, 10).map((entry) => `${entry.family} (${entry.subtype}, glyphs=${entry.numGlyphs})`),
      },
      noCmapAndNoToUnicode: {
        count: cmapSuspicious.length,
        note: 'Parsed, more than 4 glyphs, no ASCII by either path: either a genuinely exotic subset or a program whose glyphs are unreachable without the original CMap. Not reusable by any planned path.',
        families: cmapSuspicious.slice(0, 10).map((entry) => `${entry.family} (${entry.subtype}, glyphs=${entry.numGlyphs})`),
      },
    },
    paths: modesReport,
    ceilingIfBothPaths: best,
    documentLevel: {
      note: 'Mean over documents that contain text of: success for the edit of the font carrying most of that document. Scans are excluded (nothing to edit before OCR).',
      documentsWithText: textDocuments.length,
      documentsWithoutText: documents.length - textDocuments.length,
      byPath: documentLevel,
      documentsWithEmbeddedDominantFont: {
        note: 'Subset of the above where the dominant font is embedded, i.e. where the current fallback visibly changes the typeface.',
        documents: embeddedDominant.documents,
        byPath: embeddedDominant.byPath,
        ceilingIfBothPaths: {
          singleAsciiChar: embeddedDominantBest('singleAsciiChar'),
          wordAscii: embeddedDominantBest('wordAscii'),
          wordLatvian: embeddedDominantBest('wordLatvian'),
          wordCyrillic: embeddedDominantBest('wordCyrillic'),
        },
      },
      ceilingIfBothPaths: {
        singleAsciiChar: documentLevelBest('singleAsciiChar'),
        wordAscii: documentLevelBest('wordAscii'),
        wordLatvian: documentLevelBest('wordLatvian'),
        wordCyrillic: documentLevelBest('wordCyrillic'),
      },
    },
    byCategory,
    documents: documents.map((doc) => ({
      file: doc.file,
      size: doc.size,
      pages: doc.pages,
      loadError: doc.loadError,
      encrypted: doc.encrypted,
      fonts: doc.fonts.length,
      parsed: doc.fonts.filter((font) => font.program === 'parsed').length,
      // The font that carries most of the page's text is the one a user would try to edit first.
      topFont: topFontOf(doc),
    })),
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (args.details) {
    const details = {
      generatedAt: summary.generatedAt,
      programs: programs.map((entry) => ({
        family: entry.family,
        baseFont: entry.baseFont,
        subtype: entry.subtype,
        descendantSubtype: entry.descendantSubtype,
        format: entry.format,
        fontFileKey: entry.fontFileKey,
        program: entry.program,
        programError: entry.programError,
        programBytes: entry.programBytes,
        numGlyphs: entry.numGlyphs,
        fsType: entry.fsType,
        hasToUnicode: entry.hasToUnicode,
        cidToGidMap: entry.cidToGidMap,
        modes: entry.modes,
        occurrences: entry.occurrences,
        files: entry.files,
      })),
    };
    await fs.mkdir(path.dirname(args.details), { recursive: true });
    await fs.writeFile(args.details, `${JSON.stringify(details, null, 2)}\n`, 'utf8');
  }

  printReport(summary, files, args);
}

function readGitState() {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return { commit, dirty: dirty.length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

function printReport(summary, files, args) {
  const pct = (value) => (typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'n/a');
  const documentLevel = summary.documentLevel;

  console.log('');
  console.log(`CORPUS        ${files.length} files, ${(summary.corpus.bytes / 1024 / 1024).toFixed(1)}MB, ${summary.corpus.pages} pages, ${documentLevel.documentsWithText} with text, ${documentLevel.documentsWithoutText} scans, ${summary.corpus.encryptedDocuments.length} encrypted`);
  console.log(`FONTS         ${summary.fonts.occurrences} references, ${summary.fonts.uniquePrograms} distinct fonts, ${summary.fonts.parsed} parse with fontkit (${pct(summary.fonts.parseRate)} of those that carry a program)`);
  console.log(`              not reusable: ${summary.fonts.notReusable.type3} Type3, ${summary.fonts.notReusable.noDescriptor} standard-14, ${summary.fonts.notReusable.noFontFile} not embedded, ${summary.fonts.notReusable.decodeFailed} undecodable`);
  console.log('');
  console.log('EDIT SUCCESS — headline is per document (dominant font), the programs view is beside it');
  console.log('              document-level                      per program           reference: subset physics');
  console.log('  scenario              cmap    cid    both      cmap    cid');
  for (const key of ['singleAsciiChar', 'wordAscii', 'wordLatvian', 'wordCyrillic']) {
    const doc = summary.documentLevel.byPath;
    const cmapDoc = doc.find((item) => item.mode === 'cmap')?.[key];
    const cidDoc = doc.find((item) => item.mode === 'cid')?.[key];
    const bothDoc = summary.documentLevel.ceilingIfBothPaths[key];
    const cmapProg = summary.paths.cmap.scenarios.find((item) => item.key === key)?.meanOverPrograms;
    const cidProg = summary.paths.cid.scenarios.find((item) => item.key === key)?.meanOverPrograms;
    console.log(`  ${key.padEnd(20)} ${pct(cmapDoc).padStart(6)} ${pct(cidDoc).padStart(6)} ${pct(bothDoc).padStart(6)}    ${pct(cmapProg).padStart(6)} ${pct(cidProg).padStart(6)}`);
  }
  console.log(`  documents with at least one reusable font: ${pct(documentLevel.byPath.find((item) => item.mode === 'cmap')?.documentsWithAnyReusableFont)} (cmap), ${pct(documentLevel.byPath.find((item) => item.mode === 'cid')?.documentsWithAnyReusableFont)} (cid)`);
  const embedded = documentLevel.documentsWithEmbeddedDominantFont;
  if (embedded && embedded.documents > 0) {
    console.log('');
    console.log(`  ONLY WHERE THE FALLBACK IS VISIBLE — dominant font is embedded (${embedded.documents} docs), the case the plan is about:`);
    for (const key of ['singleAsciiChar', 'wordAscii', 'wordLatvian', 'wordCyrillic']) {
      const row = (mode) => pct(embedded.byPath.find((item) => item.mode === mode)?.[key]);
      console.log(`    ${key.padEnd(20)} cmap ${row('cmap').padStart(6)}   cid ${row('cid').padStart(6)}   both ${pct(embedded.ceilingIfBothPaths[key]).padStart(6)}`);
    }
  }
  console.log('');
  console.log('COVERAGE of a-z/A-Z/0-9 (median over distinct fonts, after fontkit parse)');
  for (const mode of MODES) {
    const stats = summary.paths[mode].coverage;
    console.log(`  ${mode.padEnd(5)} all ${pct(stats.base62.median).padStart(6)} (mean ${pct(stats.base62.mean)}, n=${stats.base62.n}, any coverage ${summary.paths[mode].productivePrograms})`);
    for (const [bucket, values] of Object.entries(stats.bySubtype)) {
      console.log(`        ${bucket.padEnd(16)} n=${String(values.n).padStart(3)}  median ${pct(values.median)}  mean ${pct(values.mean)}`);
    }
  }
  console.log('');
  console.log('BY CORPUS CATEGORY — document level (dominant font), char edit / Latvian word');
  for (const [category, values] of Object.entries(summary.byCategory)) {
    const char = values.documentLevel.singleAsciiChar;
    const lv = values.documentLevel.wordLatvian;
    const show = (triple) => `${pct(triple.cmap)}/${pct(triple.cid)}/${pct(triple.best)}`;
    console.log(`  ${category.padEnd(12)} docs=${String(values.documentsWithText).padStart(2)} fonts=${String(values.programs).padStart(3)} parsed=${String(values.parsed).padStart(3)}  char ${show(char).padEnd(22)} lv ${show(lv)}`);
  }
  console.log('');
  console.log('WHERE THE SUBSET GAP IS');
  console.log(`  program parses but has no ASCII cmap while /ToUnicode knows the characters: ${summary.fonts.cmapDeadButCidAlive.count} fonts — wave 1 cannot touch them, wave 2 can`);
  console.log(`  no ASCII by any path (exotic subsets, symbol fonts, lost CMaps):              ${summary.fonts.noCmapAndNoToUnicode.count} fonts`);
  console.log(`  fonts carrying /ToUnicode: ${summary.fonts.withToUnicode}/${summary.fonts.parsed}, /CIDToGIDMap /Identity: ${summary.fonts.identityCidToGid}`);
  if (summary.fonts.restrictedEmbedding > 0) {
    console.log(`  restricted embedding (fsType forbids reuse): ${summary.fonts.restrictedEmbedding} fonts — the gate must refuse them`);
  }
  if (summary.corpus.encryptedDocuments.length > 0) {
    console.log(`  encrypted, not measured: ${summary.corpus.encryptedDocuments.join(', ')}`);
  }
  for (const failure of summary.corpus.documentLoadFailures) {
    console.log(`  unreadable: ${failure.file} — ${failure.error}`);
  }
  console.log('');
  console.log(`baseline -> ${path.relative(ROOT, args.out)}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

export { BASE62, LETTERS, SCENARIOS, coverageOfFont, coverageOfSet, decodeStream, inspectFont, parseToUnicodeCmap, scanDocument };
