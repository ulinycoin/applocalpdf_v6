#!/usr/bin/env node
/**
 * Records a Studio canvas demo GIF: drag a page between workspaces.
 * Usage: npm run build:all && node scripts/record-studio-drag-gif.mjs
 */
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { spawn } from 'node:child_process';
import { execSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'website', 'public', 'demo');
const FRAMES_DIR = join(ROOT, '.tmp', 'studio-drag-frames');
const OUT_GIF = join(OUT_DIR, 'studio-page-drag.gif');
const PORT = Number(process.env.DEMO_PORT ?? 4174);
const BASE_URL = process.env.DEMO_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const APP_URL = `${BASE_URL}/app/studio`;

async function createDemoPdf(name, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const colors = [
    rgb(0.93, 0.35, 0.35),
    rgb(0.25, 0.55, 0.95),
    rgb(0.2, 0.72, 0.45),
  ];

  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([420, 560]);
    const color = colors[i % colors.length];
    page.drawRectangle({ x: 0, y: 0, width: 420, height: 560, color });
    page.drawRectangle({ x: 24, y: 24, width: 372, height: 512, color: rgb(1, 1, 1), opacity: 0.92 });
    page.drawText(name, { x: 48, y: 470, size: 28, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`Page ${i + 1}`, { x: 48, y: 420, size: 20, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawText('Drag me ->', { x: 48, y: 360, size: 16, font, color: rgb(0.2, 0.2, 0.2) });
  }

  const bytes = await doc.save();
  const path = join(ROOT, '.tmp', `${name}.pdf`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return path;
}

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

function buildGifFromFrames(startFrame = 2) {
  const palette = join(FRAMES_DIR, 'palette.png');
  const input = join(FRAMES_DIR, `frame-%03d.png`);
  execSync(
    `ffmpeg -y -start_number ${startFrame} -framerate 12 -i "${input}" -vf "fps=12,scale=960:-1:flags=lanczos,palettegen" "${palette}"`,
    { stdio: 'inherit' },
  );
  execSync(
    `ffmpeg -y -start_number ${startFrame} -framerate 12 -i "${input}" -i "${palette}" -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse" -loop 0 "${OUT_GIF}"`,
    { stdio: 'inherit' },
  );
}

async function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error(`Server not ready: ${url}`);
}

async function maybeStartServer() {
  try {
    const res = await fetch(`${BASE_URL}/app/studio`);
    if (res.ok) {
      console.log(`Using existing server at ${BASE_URL}`);
      return null;
    }
  } catch {
    // start below
  }

  if (process.env.DEMO_SKIP_BUILD === '1') {
    console.log('DEMO_SKIP_BUILD=1 — skipping build');
  } else {
    console.log('Building app SPA…');
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  }

  console.log(`Starting Vite preview on ${BASE_URL}…`);
  const child = spawn('npm', ['run', 'preview:e2e', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  await waitForServer(`${BASE_URL}/app/studio`);
  return child;
}

async function uploadPdfsToStudio(page, pdfPaths) {
  const files = await Promise.all(pdfPaths.map(async (pdfPath) => ({
    name: pdfPath.split('/').pop(),
    bytes: Array.from(await readFile(pdfPath)),
  })));

  const container = page.locator('.studio-shell-container');
  const dataTransfer = await page.evaluateHandle((payload) => {
    const dt = new DataTransfer();
    for (const file of payload) {
      dt.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: 'application/pdf' }));
    }
    return dt;
  }, files);

  await container.dispatchEvent('dragover', { dataTransfer });
  await container.dispatchEvent('drop', { dataTransfer });
  await dataTransfer.dispose();

  await page.locator('.studio-viewport-btn-fit:not([disabled])').waitFor({ timeout: 90_000 });
}

async function captureFrame(page, index) {
  const file = join(FRAMES_DIR, `frame-${String(index).padStart(3, '0')}.png`);
  await page.screenshot({ path: file, type: 'png' });
  return file;
}

async function animatePageTransfer(page, onStep) {
  const transfer = await page.evaluate(async () => {
    const store = window.__LOCALPDF_STUDIO_STORE__;
    if (!store) {
      throw new Error('Studio store is not exposed on window');
    }

    const state = store.getState();
    const source = state.documents.find((doc) => doc.name.includes('workspace-a'));
    const target = state.documents.find((doc) => doc.name.includes('workspace-b'));
    if (!source || !target || source.pages.length === 0) {
      throw new Error('Demo workspaces not found');
    }

    const pageId = source.pages[0].id;
    const startX = source.x + 120;
    const startY = source.y + 180;
    const endX = target.x + 120;
    const endY = target.y + 180;

    state.detachPage(source.id, pageId, startX, startY);

    return {
      pageId,
      targetDocId: target.id,
      startX,
      startY,
      endX,
      endY,
    };
  });

  await onStep();
  await delay(120);

  const steps = 20;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    const x = transfer.startX + (transfer.endX - transfer.startX) * eased;
    const y = transfer.startY + (transfer.endY - transfer.startY) * eased - Math.sin(t * Math.PI) * 36;

    await page.evaluate(({ pageId, x, y }) => {
      window.__LOCALPDF_STUDIO_STORE__.getState().moveDetachedPage(pageId, x, y);
    }, { pageId: transfer.pageId, x, y });

    await onStep();
    await delay(45);
  }

  await page.evaluate(({ pageId, targetDocId }) => {
    window.__LOCALPDF_STUDIO_STORE__.getState().attachDetachedPage(pageId, targetDocId, 1);
  }, { pageId: transfer.pageId, targetDocId: transfer.targetDocId });

  await delay(250);
  await onStep();
  await onStep();
}

async function main() {
  if (!hasFfmpeg()) {
    throw new Error('ffmpeg is required. Install with: brew install ffmpeg');
  }

  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const server = await maybeStartServer();
  const pdfA = await createDemoPdf('workspace-a', 2);
  const pdfB = await createDemoPdf('workspace-b', 1);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const page = await context.newPage();

  let frame = 0;
  const snap = async () => {
    await captureFrame(page, frame);
    frame += 1;
  };

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.studio-shell-container', { timeout: 30_000 });

    await uploadPdfsToStudio(page, [pdfA, pdfB]);
    await page.locator('.studio-viewport-btn-fit').click();
    await delay(1200);
    await snap();
    await snap();

    await animatePageTransfer(page, snap);

    buildGifFromFrames(0);
    const sizeKb = Math.round(readFileSync(OUT_GIF).length / 1024);
    console.log(`\nGIF saved: ${OUT_GIF} (${sizeKb} KB, ${frame} frames)`);
  } finally {
    await browser.close();
    if (server) {
      process.kill(-server.pid);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
