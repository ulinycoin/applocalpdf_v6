#!/usr/bin/env node
/**
 * Records Studio canvas demo clips — one per tool.
 *
 * Scenarios drive the real UI (Playwright mouse/keyboard) and screenshot the canvas;
 * ffmpeg assembles the frames into an MP4 (plus a WebP poster for reduced-motion users).
 * Nothing is drawn by hand: every frame is a capture of the running app.
 *
 * Usage:
 *   node scripts/record-studio-demos.mjs                 # every scenario
 *   node scripts/record-studio-demos.mjs --only=annotate # one or more (comma separated)
 *   node scripts/record-studio-demos.mjs --list
 *   node scripts/record-studio-demos.mjs --gif           # also emit GIFs into .tmp/demo-gifs
 *                                                            # (for channels that need GIF; not shipped)
 *
 * Server: reuses DEMO_BASE_URL when it responds, otherwise builds and runs preview
 * on DEMO_PORT. Set DEMO_SKIP_BUILD=1 to reuse an existing dist.
 */
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'website', 'public', 'demo');
const TMP_DIR = join(ROOT, '.tmp');
const FRAMES_ROOT = join(TMP_DIR, 'demo-frames');
const GIF_DIR = join(TMP_DIR, 'demo-gifs');
/* Generated demo PDFs live in their own folder: `.tmp/` also holds tracked scratch files. */
const ASSETS_DIR = join(TMP_DIR, 'demo-assets');
const PORT = Number(process.env.DEMO_PORT ?? 4174);
const BASE_URL = process.env.DEMO_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const APP_URL = `${BASE_URL}/app/studio`;

const VIDEO_WIDTH = 1200;
const VIDEO_FPS = 14;

/* Studio canvas layout (mirrors StudioShell.tsx + StudioDocument.tsx). A mismatch would
   silently aim clicks at empty canvas, so every click is verified against store selection. */
const CANVAS = { CARD_W: 200, CARD_H: 280, GAP_X: 20, GAP_Y: 30, PAD: 10 };

const PAGE = { W: 420, H: 560, MARGIN: 36 };

/* `tag` marks the lines the demo interactions target, so stroke coordinates are derived
   from the same layout data that draws the page instead of guessed fractions. */
const BODY_LINES = [
    { text: 'SERVICE AGREEMENT', size: 19, gap: 34, bold: true },
    { text: 'This Agreement is entered into as of the Effective Date', size: 11, gap: 18 },
    { text: 'between the parties identified below. Each party agrees', size: 11, gap: 18 },
    { text: 'to the terms set out in this document and its schedules.', size: 11, gap: 30 },
    { text: '1. Scope of Work', size: 13, gap: 22, bold: true },
    { text: 'The Provider shall deliver the services described in', size: 11, gap: 18, tag: 'highlight' },
    { text: 'Schedule A in a professional and workmanlike manner, in', size: 11, gap: 18, tag: 'highlight' },
    { text: 'line with the timelines agreed by the parties in writing.', size: 11, gap: 30, tag: 'highlight' },
    { text: '2. Fees and Payment', size: 13, gap: 22, bold: true },
    { text: 'Invoices are payable within thirty (30) days of receipt.', size: 11, gap: 18 },
    { text: 'Confidential - Account 4417-0092', size: 11, gap: 30, tag: 'confidential' },
    { text: '3. Term and Termination', size: 13, gap: 22, bold: true },
    { text: 'This Agreement remains in force until either party ends', size: 11, gap: 18 },
    { text: 'it with thirty (30) days written notice.', size: 11, gap: 18 },
];

function parseArgs(argv) {
    const only = argv.find((arg) => arg.startsWith('--only='));
    return {
        list: argv.includes('--list'),
        gif: argv.includes('--gif'),
        only: only ? only.slice('--only='.length).split(',').map((id) => id.trim()).filter(Boolean) : null,
    };
}

export function hasFfmpeg() {
    return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

/** Glyph band of a text line as top-down page fractions. */
function bandFor(baseline, size) {
    const cap = size * 0.74;
    return {
        top: (PAGE.H - baseline - cap) / PAGE.H,
        bottom: (PAGE.H - baseline) / PAGE.H,
    };
}

export async function createTextPdf(name) {
    const doc = await PDFDocument.create();
    const body = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([PAGE.W, PAGE.H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE.W, height: PAGE.H, color: rgb(1, 1, 1) });

    const maxWidth = PAGE.W - PAGE.MARGIN * 2;
    const targets = { highlight: [], confidential: null, insert: { x: 0.5, y: 0.84 } };
    let baseline = PAGE.H + 8;

    for (const line of BODY_LINES) {
        baseline -= line.gap;
        const font = line.bold ? bold : body;
        const width = font.widthOfTextAtSize(line.text, line.size);
        if (width > maxWidth) {
            throw new Error(`Demo PDF line overflows the page (${Math.round(width)} > ${maxWidth}): ${line.text}`);
        }
        page.drawText(line.text, {
            x: PAGE.MARGIN,
            y: baseline,
            size: line.size,
            font,
            color: line.tag === 'confidential' ? rgb(0.72, 0.12, 0.12) : rgb(0.12, 0.12, 0.14),
        });

        if (line.tag) {
            const band = {
                ...bandFor(baseline, line.size),
                x0: (PAGE.MARGIN - 6) / PAGE.W,
                x1: (PAGE.MARGIN + width + 6) / PAGE.W,
            };
            if (line.tag === 'confidential') targets.confidential = band;
            else targets.highlight.push(band);
        }
    }

    const path = join(ASSETS_DIR, `${name}.pdf`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, await doc.save());
    return { path, targets };
}

export async function createWorkspacePdf(name, pageCount) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const colors = [rgb(0.93, 0.35, 0.35), rgb(0.25, 0.55, 0.95), rgb(0.2, 0.72, 0.45)];

    for (let i = 0; i < pageCount; i += 1) {
        const page = doc.addPage([420, 560]);
        page.drawRectangle({ x: 0, y: 0, width: 420, height: 560, color: colors[i % colors.length] });
        page.drawRectangle({ x: 24, y: 24, width: 372, height: 512, color: rgb(1, 1, 1), opacity: 0.92 });
        page.drawText(name, { x: 48, y: 470, size: 28, font, color: rgb(0.1, 0.1, 0.1) });
        page.drawText(`Page ${i + 1}`, { x: 48, y: 420, size: 20, font, color: rgb(0.35, 0.35, 0.35) });
    }

    const path = join(ASSETS_DIR, `${name}.pdf`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, await doc.save());
    return path;
}

export function createFrameWriter(id) {
    const uniqueDir = join(FRAMES_ROOT, id);
    const seqDir = join(FRAMES_ROOT, `${id}-seq`);
    rmSync(uniqueDir, { recursive: true, force: true });
    rmSync(seqDir, { recursive: true, force: true });
    mkdirSync(uniqueDir, { recursive: true });
    mkdirSync(seqDir, { recursive: true });

    let unique = 0;
    let seq = 0;
    let posterIndex = null;
    return {
        seqDir,
        frameCount: () => seq,
        async snap(page, hold = 1) {
            const name = `u-${String(unique).padStart(4, '0')}.png`;
            const file = join(uniqueDir, name);
            await page.screenshot({ path: file, type: 'png' });
            for (let i = 0; i < hold; i += 1) {
                copyFileSync(file, join(seqDir, `s-${String(seq).padStart(4, '0')}.png`));
                seq += 1;
            }
            unique += 1;
        },
        /** Marks the last captured frame as the static poster shown to reduced-motion users. */
        markPoster() {
            posterIndex = unique - 1;
        },
        posterFrame() {
            if (posterIndex === null) return null;
            return join(uniqueDir, `u-${String(posterIndex).padStart(4, '0')}.png`);
        },
    };
}

/** Static WebP poster: the reduced-motion substitute for the animated GIF. */
export function buildPoster({ framePath, outPath }) {
    mkdirSync(dirname(outPath), { recursive: true });
    execSync(
        `ffmpeg -y -v error -i "${framePath}" -vf "scale=${VIDEO_WIDTH}:-1:flags=lanczos" -c:v libwebp -quality 82 "${outPath}"`,
        { stdio: 'inherit' },
    );
}

/**
 * H.264 MP4 from the captured frames. Encoded straight from the PNG sequence rather than
 * from the GIF, so the 24-bit colour survives; silent (screen recording, no audio track).
 */
export function buildVideo({ seqDir, outPath }) {
    mkdirSync(dirname(outPath), { recursive: true });
    execSync(
        `ffmpeg -y -v error -framerate ${VIDEO_FPS} -i "${join(seqDir, 's-%04d.png')}" ` +
        `-vf "scale=${VIDEO_WIDTH}:-2:flags=lanczos" -c:v libx264 -preset slow -crf 30 ` +
        `-pix_fmt yuv420p -movflags +faststart -an "${outPath}"`,
        { stdio: 'inherit' },
    );
}

export function buildGif({ seqDir, outPath }) {
    mkdirSync(dirname(outPath), { recursive: true });
    const palette = join(TMP_DIR, `palette-${Date.now()}.png`);
    const input = join(seqDir, 's-%04d.png');
    const scale = `scale=${VIDEO_WIDTH}:-1:flags=lanczos`;
    execSync(
        `ffmpeg -y -v error -framerate ${VIDEO_FPS} -i "${input}" -vf "${scale},palettegen=stats_mode=diff" "${palette}"`,
        { stdio: 'inherit' },
    );
    execSync(
        `ffmpeg -y -v error -framerate ${VIDEO_FPS} -i "${input}" -i "${palette}" -lavfi "${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" -loop 0 "${outPath}"`,
        { stdio: 'inherit' },
    );
    rmSync(palette, { force: true });
}

export async function waitForServer(url, timeoutMs = 180_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const res = await fetch(url);
            if (res.ok) return true;
        } catch {
            // not up yet
        }
        await delay(500);
    }
    return false;
}

export async function maybeStartServer() {
    if (await waitForServer(APP_URL, 3_000)) {
        console.log(`Using existing server at ${BASE_URL}`);
        return null;
    }

    if (process.env.DEMO_SKIP_BUILD !== '1') {
        console.log('Building app SPA…');
        execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    }

    console.log(`Starting preview on ${BASE_URL}…`);
    const child = spawn(
        'npm',
        ['run', 'preview:e2e', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
        { cwd: ROOT, stdio: 'ignore', detached: true },
    );
    if (!(await waitForServer(APP_URL))) {
        throw new Error(`Preview server did not come up at ${APP_URL}`);
    }
    return child;
}

/* ------------------------------------------------------------------ */
/* Page helpers — every one of these asserts, so a silent miss is fatal */
/* ------------------------------------------------------------------ */

export async function uploadPdfs(page, pdfPaths) {
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
    await page.waitForFunction(
        () => window.__LOCALPDF_STUDIO_STORE__?.getState().documents.length > 0,
        { timeout: 90_000 },
    );
}

export async function getState(page) {
    return page.evaluate(() => {
        const s = window.__LOCALPDF_STUDIO_STORE__?.getState();
        if (!s) throw new Error('Studio store is not exposed — is the app running in dev/webdriver mode?');
        return {
            selection: s.selection,
            viewScale: s.studioViewScale,
            viewPosition: s.studioViewPosition,
            gridColumns: s.gridColumns,
            documents: s.documents.map((doc) => ({
                id: doc.id,
                name: doc.name,
                x: doc.x,
                y: doc.y,
                pages: doc.pages.map((p) => ({ id: p.id })),
            })),
        };
    });
}

export async function pageScreenPoint(page, docName, pageIndex, fx = 0.5, fy = 0.4) {
    const state = await getState(page);
    const doc = state.documents.find((d) => d.name.includes(docName));
    if (!doc) throw new Error(`Workspace not found: ${docName} (have: ${state.documents.map((d) => d.name).join(', ')})`);
    const target = doc.pages[pageIndex];
    if (!target) throw new Error(`Workspace ${docName} has no page #${pageIndex}`);

    const cols = state.gridColumns || 1;
    const col = pageIndex % cols;
    const row = Math.floor(pageIndex / cols);
    const localX = CANVAS.PAD + col * (CANVAS.CARD_W + CANVAS.GAP_X);
    const localY = CANVAS.PAD + row * (CANVAS.CARD_H + CANVAS.GAP_Y);
    const worldX = doc.x + localX + CANVAS.CARD_W * fx;
    const worldY = doc.y + localY + CANVAS.CARD_H * fy;

    const canvasBox = await page.locator('.studio-shell-canvas canvas').first().boundingBox();
    if (!canvasBox) throw new Error('Canvas element has no bounding box');
    return {
        x: canvasBox.x + worldX * state.viewScale + state.viewPosition.x,
        y: canvasBox.y + worldY * state.viewScale + state.viewPosition.y,
        pageId: target.id,
    };
}

export async function clickPage(page, docName, pageIndex, { shift = false, hold = 2, rec } = {}) {
    const point = await pageScreenPoint(page, docName, pageIndex);
    await page.mouse.move(point.x, point.y, { steps: 6 });
    if (rec) await rec.snap(page, 1);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
    await delay(140);

    const state = await getState(page);
    if (!state.selection.some((item) => item.pageId === point.pageId)) {
        throw new Error(`Click missed page ${pageIndex} of ${docName} — canvas layout math drifted`);
    }
    if (rec) await rec.snap(page, hold);
    return point.pageId;
}

export async function clickFit(page) {
    await page.locator('.studio-viewport-btn-fit:not([disabled])').click();
    await delay(700);
}

export async function openEditTool(page, toolLabel) {
    const button = page.locator('.studio-tool-rail-btn', { hasText: toolLabel }).first();
    await button.waitFor({ timeout: 20_000 });
    await button.click();
    await page.locator('.studio-edit-canvas-surface').waitFor({ timeout: 30_000 });
    await page.locator('.studio-edit-page-image').waitFor({ timeout: 30_000 });
    // Default zoom fits the page width, so the bottom of the page sits below the fold and
    // clicks aimed at lower fractions would land outside the viewport.
    await page.locator('.studio-floating-btn[title="Fit to Page"]').click();
    await delay(1_200);
    await assertSurfaceInViewport(page);
}

/** Every pointer target must be inside the viewport, otherwise mouse events go nowhere. */
async function assertSurfaceInViewport(page) {
    const box = await surfaceBox(page);
    const viewport = page.viewportSize();
    if (box.y < 0 || box.y + box.height > viewport.height) {
        throw new Error(`Edit surface (${Math.round(box.height)}px at y=${Math.round(box.y)}) does not fit viewport ${viewport.height}px`);
    }
    return box;
}

export async function surfaceBox(page) {
    const box = await page.locator('.studio-edit-canvas-surface').boundingBox();
    if (!box) throw new Error('Edit canvas surface has no bounding box');
    return box;
}

/** Freehand stroke over the edit surface; fractions are relative to the page. */
export async function drawPath(page, rec, box, points, { hold = 1, stepDelay = 38 } = {}) {
    const toScreen = ([fx, fy]) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
    const first = toScreen(points[0]);
    await page.mouse.move(first.x, first.y, { steps: 4 });
    await rec.snap(page, 1);
    await page.mouse.down();
    for (const point of points.slice(1)) {
        const { x, y } = toScreen(point);
        await page.mouse.move(x, y, { steps: 1 });
        await rec.snap(page, hold);
        await delay(stepDelay);
    }
    await page.mouse.up();
    await delay(120);
}

/** Dense polyline between two fractions, used for highlighter sweeps. */
export function linePoints(from, to, steps) {
    return Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    });
}

function signaturePoints(baseY = 0.6) {
    const points = [];
    for (let i = 0; i <= 26; i += 1) {
        const t = i / 26;
        const x = 0.28 + t * 0.42;
        const y = baseY
            - Math.sin(t * Math.PI * 3.2) * 0.05 * (1 - t * 0.55)
            - t * 0.022;
        points.push([x, y]);
    }
    points.push([0.74, baseY - 0.03], [0.67, baseY + 0.02]);
    return points;
}

export async function saveAndReturnToCanvas(page, rec) {
    const saveBtn = page.locator('[data-testid="studio-edit-save-btn"]');
    await saveBtn.waitFor({ timeout: 20_000 });
    if (await saveBtn.isDisabled()) {
        throw new Error('Save is disabled — the tool interaction produced no change to the page');
    }
    await saveBtn.click();
    await rec.snap(page, 2);
    await page.waitForFunction(
        () => {
            const btn = document.querySelector('[data-testid="studio-edit-save-btn"]');
            return btn instanceof HTMLButtonElement && !btn.disabled;
        },
        { timeout: 120_000 },
    ).catch(() => {});
    await delay(2_000);
    await rec.snap(page, 2);

    const back = page.locator('.studio-edit-back-btn');
    if (await back.count()) {
        await back.click();
        await delay(1_400);
        await rec.snap(page, 2);
    }
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

const scenarios = [
    {
        id: 'page-drag',
        title: 'Drag a page between workspaces',
        out: 'localpdf-drag-pages-between-documents.mp4',
        async run({ page, rec, pdfs }) {
            await uploadPdfs(page, [pdfs.workspaceA, pdfs.workspaceB]);
            await clickFit(page);
            await rec.snap(page, 5);

            const transfer = await page.evaluate(() => {
                const store = window.__LOCALPDF_STUDIO_STORE__;
                const state = store.getState();
                const source = state.documents.find((doc) => doc.name.includes('workspace-a'));
                const target = state.documents.find((doc) => doc.name.includes('workspace-b'));
                if (!source || !target || source.pages.length === 0) throw new Error('Demo workspaces not found');

                const pageId = source.pages[0].id;
                const startX = source.x + 120;
                const startY = source.y + 180;
                const endX = target.x + 120;
                const endY = target.y + 180;
                state.detachPage(source.id, pageId, startX, startY);
                return { pageId, targetDocId: target.id, startX, startY, endX, endY };
            });

            await rec.snap(page, 2);
            const steps = 20;
            for (let i = 1; i <= steps; i += 1) {
                const t = i / steps;
                const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
                const x = transfer.startX + (transfer.endX - transfer.startX) * eased;
                const y = transfer.startY + (transfer.endY - transfer.startY) * eased - Math.sin(t * Math.PI) * 36;
                await page.evaluate(({ pageId, x, y }) => {
                    window.__LOCALPDF_STUDIO_STORE__.getState().moveDetachedPage(pageId, x, y);
                }, { pageId: transfer.pageId, x, y });
                await rec.snap(page, 1);
                await delay(45);
            }

            await page.evaluate(({ pageId, targetDocId }) => {
                window.__LOCALPDF_STUDIO_STORE__.getState().attachDetachedPage(pageId, targetDocId, 1);
            }, { pageId: transfer.pageId, targetDocId: transfer.targetDocId });
            await delay(400);
            await rec.snap(page, 3);
            await clickFit(page);
            await rec.snap(page, 12);
            rec.markPoster();
        },
    },

    {
        id: 'merge',
        title: 'Merge selected pages into another workspace',
        out: 'localpdf-merge-pdf-pages.mp4',
        async run({ page, rec, pdfs }) {
            await uploadPdfs(page, [pdfs.workspaceA, pdfs.workspaceB]);
            await clickFit(page);
            await rec.snap(page, 6);

            await clickPage(page, 'workspace-a', 0, { rec, hold: 3 });
            await clickPage(page, 'workspace-a', 1, { shift: true, rec, hold: 4 });

            const mergeButton = page.locator('.studio-tool-rail-btn[title^="Merge"]');
            const box = await mergeButton.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
            await rec.snap(page, 5);

            const before = await getState(page);
            const beforeCount = before.documents.find((d) => d.name.includes('workspace-b')).pages.length;
            await mergeButton.click();

            await page.waitForFunction(
                (count) => {
                    const state = window.__LOCALPDF_STUDIO_STORE__.getState();
                    const target = state.documents.find((doc) => doc.name.includes('workspace-b'));
                    return target && target.pages.length > count;
                },
                beforeCount,
                { timeout: 15_000 },
            );
            await rec.snap(page, 4);
            await clickFit(page);
            await rec.snap(page, 14);
            rec.markPoster();
        },
    },

    {
        id: 'annotate',
        title: 'Highlight text on the canvas',
        out: 'localpdf-highlight-pdf-text.mp4',
        async run({ page, rec, pdfs }) {
            await uploadPdfs(page, [pdfs.contract.path]);
            await clickFit(page);
            await rec.snap(page, 4);
            await clickPage(page, 'contract', 0, { rec });
            await openEditTool(page, 'Annotate');
            await rec.snap(page, 3);

            const box = await surfaceBox(page);
            for (const band of pdfs.contract.targets.highlight) {
                const y = (band.top + band.bottom) / 2;
                await drawPath(page, rec, box, linePoints([band.x0, y], [band.x1, y], 13), { hold: 1, stepDelay: 34 });
                await rec.snap(page, 2);
            }
            await rec.snap(page, 5);

            rec.markPoster();
            await saveAndReturnToCanvas(page, rec);
            await clickFit(page);
            await rec.snap(page, 6);
        },
    },

    {
        id: 'sign',
        title: 'Draw a signature on the page',
        out: 'localpdf-sign-pdf-signature.mp4',
        async run({ page, rec, pdfs }) {
            await uploadPdfs(page, [pdfs.contract.path]);
            await clickFit(page);
            await rec.snap(page, 4);
            await clickPage(page, 'contract', 0, { rec });
            await openEditTool(page, 'Sign');
            await page.locator('.ep-seg-btn', { hasText: 'Draw' }).first().click();
            await delay(400);
            await rec.snap(page, 3);

            const box = await surfaceBox(page);
            const signY = pdfs.contract.targets.insert.y;
            await drawPath(page, rec, box, signaturePoints(signY), { hold: 1, stepDelay: 40 });
            await rec.snap(page, 4);

            // A drawn signature stays a draft until it is inserted onto the page.
            const insertBtn = page.locator('.ep-action-btn--primary', { hasText: 'Insert' }).first();
            await page.waitForFunction(
                () => {
                    const btn = [...document.querySelectorAll('.ep-action-btn--primary')]
                        .find((el) => el.textContent?.includes('Insert'));
                    return btn instanceof HTMLButtonElement && !btn.disabled;
                },
                { timeout: 15_000 },
            );
            await insertBtn.click();
            await delay(500);
            await rec.snap(page, 5);

            rec.markPoster();
            await saveAndReturnToCanvas(page, rec);
            await clickFit(page);
            await rec.snap(page, 6);
        },
    },

    {
        id: 'whiteout',
        title: 'Erase sensitive content with whiteout',
        out: 'localpdf-redact-pdf-whiteout.mp4',
        async run({ page, rec, pdfs }) {
            await uploadPdfs(page, [pdfs.contract.path]);
            await clickFit(page);
            await rec.snap(page, 4);
            await clickPage(page, 'contract', 0, { rec });
            await openEditTool(page, 'Whiteout');
            await rec.snap(page, 3);

            const box = await surfaceBox(page);
            const band = pdfs.contract.targets.confidential;
            // Corner-to-corner drag: the box must end clearly taller than it started,
            // the tool drops rectangles under 0.002 page height (its own minimum).
            const top = band.top - 0.004;
            const bottom = band.bottom + 0.008;
            await drawPath(
                page,
                rec,
                box,
                linePoints([band.x0, top], [band.x1, bottom], 14),
                { hold: 1, stepDelay: 55 },
            );
            await rec.snap(page, 6);

            rec.markPoster();
            await saveAndReturnToCanvas(page, rec);
            await clickFit(page);
            await rec.snap(page, 6);
        },
    },

    {
        id: 'text',
        title: 'Add a text box to the page',
        out: 'localpdf-add-text-to-pdf.mp4',
        async run({ page, rec, pdfs }) {
            await uploadPdfs(page, [pdfs.contract.path]);
            await clickFit(page);
            await rec.snap(page, 4);
            await clickPage(page, 'contract', 0, { rec });
            await openEditTool(page, 'Text');
            await rec.snap(page, 3);

            const addTextBox = page.locator('.ep-select').first();
            await addTextBox.click();
            await delay(300);
            await rec.snap(page, 3);
            const addModeLabel = (await addTextBox.innerText()).trim();
            if (!/place/i.test(addModeLabel)) {
                throw new Error(`Add-text mode did not engage (button still reads "${addModeLabel}")`);
            }

            const box = await surfaceBox(page);
            const x = box.x + box.width * pdfs.contract.targets.insert.x;
            const y = box.y + box.height * pdfs.contract.targets.insert.y;
            await page.mouse.move(x, y, { steps: 8 });
            await rec.snap(page, 2);
            await page.mouse.down();
            await page.mouse.up();
            const textarea = page.locator('.studio-edit-textarea');
            await textarea.waitFor({ timeout: 15_000 });
            // autoFocus is not reliable through the portal overlay — without an explicit
            // click the keystrokes go to the body and the frame only ever shows the placeholder.
            await textarea.click();
            await delay(400);
            await rec.snap(page, 2);

            const label = 'Signed: A. Founder';
            for (const char of label) {
                await page.keyboard.type(char);
                await rec.snap(page, 1);
                await delay(70);
            }
            const typed = await textarea.inputValue();
            if (typed !== label) {
                throw new Error(`Text box received "${typed}" instead of "${label}"`);
            }
            await rec.snap(page, 4);

            await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.1);
            await delay(300);
            await rec.snap(page, 4);

            rec.markPoster();
            await saveAndReturnToCanvas(page, rec);
            await clickFit(page);
            await rec.snap(page, 6);
        },
    },

    {
        id: 'protect',
        title: 'Password-protect a PDF',
        out: 'localpdf-protect-pdf-password.mp4',
        async run({ page, rec, pdfs }) {
            await uploadPdfs(page, [pdfs.contract.path]);
            await clickFit(page);
            await rec.snap(page, 4);
            await clickPage(page, 'contract', 0, { rec });
            await openEditTool(page, 'Protect');
            await rec.snap(page, 3);

            // Presets drive the permission set; Business is the middle option.
            const preset = page.locator('.ep-seg-btn', { hasText: 'Business' }).first();
            await preset.click();
            await delay(300);
            await rec.snap(page, 3);

            // Default is restrictions-only, which needs no password. Switching the toggle
            // reveals the open-password field and is what unlocks the Protect button.
            const restrictionsOnly = page.locator('.ep-toggle-row input[type="checkbox"]').first();
            await restrictionsOnly.click();
            await delay(300);
            await rec.snap(page, 3);

            const passwordField = page.locator('input[placeholder="Required to open"]');
            await passwordField.waitFor({ timeout: 10_000 });
            await passwordField.click();
            for (const char of 'demo-2026') {
                await page.keyboard.type(char);
                await rec.snap(page, 1);
                await delay(80);
            }
            await rec.snap(page, 4);
            rec.markPoster();

            const protectBtn = page.locator('[data-testid="studio-edit-save-btn"]');
            if (await protectBtn.isDisabled()) {
                throw new Error('Protect button is disabled after setting an open password');
            }
            await protectBtn.click();
            await rec.snap(page, 2);

            // Encryption runs through the tool runner; the protected document replaces the source.
            await page.waitForFunction(
                () => window.__LOCALPDF_STUDIO_STORE__.getState().documents.some((doc) => /protected/i.test(doc.name)),
                { timeout: 120_000 },
            );
            await delay(2_000);
            await rec.snap(page, 3);

            // The editor stays open on the protected file, so leaving is a real user step.
            const back = page.locator('.studio-edit-back-btn');
            if (await back.count()) {
                await back.click();
                await page.waitForTimeout(1_500);
                await rec.snap(page, 3);
            }
            await clickFit(page);
            await rec.snap(page, 6);
        },
    },
];

/* ------------------------------------------------------------------ */

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.list) {
        for (const scenario of scenarios) console.log(`${scenario.id.padEnd(12)} ${scenario.title} → ${scenario.out}`);
        return;
    }

    const selected = args.only ? scenarios.filter((s) => args.only.includes(s.id)) : scenarios;
    if (selected.length === 0) {
        throw new Error(`No scenario matched. Available: ${scenarios.map((s) => s.id).join(', ')}`);
    }
    if (!hasFfmpeg()) throw new Error('ffmpeg is required. Install with: brew install ffmpeg');

    mkdirSync(OUT_DIR, { recursive: true });
    mkdirSync(TMP_DIR, { recursive: true });
    mkdirSync(ASSETS_DIR, { recursive: true });

    const server = await maybeStartServer();
    const pdfs = {
        workspaceA: await createWorkspacePdf('workspace-a', 3),
        workspaceB: await createWorkspacePdf('workspace-b', 2),
        contract: await createTextPdf('contract'),
    };

    const browser = await chromium.launch({ headless: true });
    const results = [];

    try {
        for (const scenario of selected) {
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
                deviceScaleFactor: 2,
                colorScheme: 'light',
            });
            const page = await context.newPage();
            const rec = createFrameWriter(scenario.id);
            const outPath = join(OUT_DIR, scenario.out);

            console.log(`\n▶ ${scenario.id} — ${scenario.title}`);
            try {
                await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60_000 });
                await page.waitForSelector('.studio-shell-container', { timeout: 30_000 });
                await scenario.run({ page, rec, pdfs });

                if (rec.frameCount() < 4) throw new Error(`Only ${rec.frameCount()} frames captured`);
                buildVideo({ seqDir: rec.seqDir, outPath });

                const posterFrame = rec.posterFrame();
                if (!posterFrame) throw new Error('Scenario did not call rec.markPoster()');
                const posterPath = outPath.replace(/\.mp4$/, '-poster.webp');
                buildPoster({ framePath: posterFrame, outPath: posterPath });

                let gifKb = null;
                if (args.gif) {
                    const gifPath = join(GIF_DIR, scenario.out.replace(/\.mp4$/, '.gif'));
                    buildGif({ seqDir: rec.seqDir, outPath: gifPath });
                    gifKb = Math.round(readFileSync(gifPath).length / 1024);
                }

                const sizeKb = Math.round(readFileSync(outPath).length / 1024);
                const posterKb = Math.round(readFileSync(posterPath).length / 1024);
                console.log(`  ✓ ${scenario.out} — ${rec.frameCount()} frames, ${sizeKb} KB + poster ${posterKb} KB${gifKb ? ` + gif ${gifKb} KB` : ''}`);
                results.push({ id: scenario.id, out: scenario.out, frames: rec.frameCount(), kb: sizeKb, posterKb, gifKb, ok: true });
            } catch (error) {
                console.error(`  ✗ ${scenario.id} failed: ${error.message}`);
                results.push({ id: scenario.id, ok: false, error: error.message });
            } finally {
                await context.close();
            }
        }
    } finally {
        await browser.close();
        if (server) process.kill(-server.pid);
    }

    const failed = results.filter((r) => !r.ok);
    console.log('\n── summary ──');
    for (const r of results) {
        console.log(r.ok ? `ok   ${r.id} (${r.frames} frames, ${r.kb} KB)` : `FAIL ${r.id}: ${r.error}`);
    }
    if (failed.length === selected.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
