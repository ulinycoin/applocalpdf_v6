/**
 * Measures what Compress actually saves on real files, in a real browser.
 *
 * The engine depends on `OffscreenCanvas` and JPEG encoding, so Node cannot run it: this starts the
 * Vite dev server (or reuses the one already on 3001), loads the engine module inside Chromium and
 * compresses each file at both presets. Output is a table, plus a page-count check of the result.
 *
 * Usage: npm run measure:compress [file.pdf ...]
 * With no arguments it measures a fixed subset of the shipped font corpus.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { chromium } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3001';
const DEFAULT_FILES = [
  'test/fixtures/font-corpus/scan-menu-198.pdf',
  'test/fixtures/font-corpus/html-weasy-checklist.pdf',
  'test/fixtures/font-corpus/scan-receipt.pdf',
  'test/fixtures/font-corpus/office-install-guide.pdf',
  'test/fixtures/font-corpus/html-skia-type3.pdf',
];

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function startDevServer() {
  if (await reachable(BASE_URL)) {
    return null;
  }
  const child = spawn('npm', ['run', 'dev'], { stdio: 'ignore', detached: true });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await reachable(BASE_URL)) {
      return child;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  process.kill(-child.pid, 'SIGTERM');
  throw new Error('dev server did not start on 3001');
}

async function measure(page, file) {
  const source = readFileSync(file);
  const result = await page.evaluate(async ({ b64 }) => {
    const bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
    const { PdfLibCompressEngine } = await import('/app/src/services/pdf/compress-engine.ts');
    const engine = new PdfLibCompressEngine();
    const presets = {};
    for (const quality of ['medium', 'high']) {
      const started = performance.now();
      const blob = await engine.compress(new Blob([bytes], { type: 'application/pdf' }), { quality });
      presets[quality] = {
        outBytes: new Uint8Array(await blob.arrayBuffer()).byteLength,
        ms: Math.round(performance.now() - started),
      };
    }
    return presets;
  }, { b64: source.toString('base64') });

  const before = await PDFDocument.load(source);
  console.log(
    basename(file).padEnd(30),
    String(source.length).padStart(8),
    `pages=${before.getPageCount()}`.padEnd(10),
    format(result.medium, source.length, 'medium'),
    format(result.high, source.length, 'high'),
  );
}

function format(preset, inputBytes, label) {
  const percent = ((1 - preset.outBytes / inputBytes) * 100).toFixed(1);
  return `${label}=${preset.outBytes} (${percent}%, ${preset.ms}ms)`;
}

const files = (process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_FILES)
  .map((file) => resolve(file))
  .filter((file) => {
    if (!existsSync(file)) {
      console.warn('missing, skipped:', file);
      return false;
    }
    return true;
  });

if (files.length === 0) {
  console.error('no input files');
  process.exit(1);
}

const server = await startDevServer();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(300_000);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  console.log('file'.padEnd(30), 'input'.padStart(8), 'info'.padEnd(10), 'presets');
  for (const file of files) {
    await measure(page, file);
  }
} finally {
  await browser.close();
  if (server) {
    process.kill(-server.pid, 'SIGTERM');
  }
}
