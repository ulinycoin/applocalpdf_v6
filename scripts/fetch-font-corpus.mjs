#!/usr/bin/env node
/**
 * Wave 0, task 0.1 — builds the corpus the font-reuse measurement runs on.
 *
 * The corpus is a *local measurement input*, not a test fixture: it mixes third-party documents
 * copied from the founder's disk (their licences and their personal data stay where they were) with
 * PDFs generated here. The whole `test/fixtures/font-corpus/` directory is gitignored, and the
 * `manifest.json` written inside it is the provenance record — source path, size, sha256 — for the
 * run that produced the baseline currently in the repository.
 *
 * Copies are best effort: a vendor manual deleted from `~/Downloads` must not turn a measurement
 * run into a hard failure, so a missing source is a warning and the entry is skipped.
 *
 * Generated files are not byte-reproducible (Chrome stamps its own ids, qpdf rewrites the xref), so
 * the manifest sha256 identifies *this* run, not a canonical artefact.
 *
 * Usage:
 *   node scripts/fetch-font-corpus.mjs [--out <dir>] [--force] [--only <category>] [--list] [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_OUT = path.join(ROOT, 'test/fixtures/font-corpus');
const BUILD_DIR = path.join(ROOT, '.tmp/font-corpus-build');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
];

const OFFICE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm }
body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.45 }
h1 { font-family: Arial, Helvetica, sans-serif; font-size: 17pt; margin: 0 0 4mm }
h2 { font-size: 12pt; margin: 6mm 0 2mm }
table { border-collapse: collapse; width: 100%; font-size: 10pt }
td, th { border: 1px solid #444; padding: 2mm 3mm; text-align: left }
.num { text-align: right; font-variant-numeric: tabular-nums }
small { color: #555 }
</style></head><body>
<h1>PROFORMA INVOICE Nr. 2026/0042</h1>
<p><small>Seller: SIA Piemērs, Jelgavas iela 59, Rīga, LV-1004 · VAT LV40003000000 · Issued 2026-11-11 · Due 2026-12-11</small></p>
<h2>Billing details</h2>
<table>
<tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr>
<tr><td>Lift maintenance, monthly contract</td><td>1</td><td class="num">124.00</td><td class="num">124.00</td></tr>
<tr><td>Emergency call-out, 2 hours</td><td>2</td><td class="num">38.50</td><td class="num">77.00</td></tr>
<tr><td>Safety inspection certificate</td><td>1</td><td class="num">45.00</td><td class="num">45.00</td></tr>
<tr><td colspan="3"><b>Total (VAT 21% included)</b></td><td class="num"><b>297.42</b></td></tr>
</table>
<h2>Terms</h2>
<p>Payment within 30 days to account LV12 HABA 0000 0000 0000 0. Late payment interest 0.1% per day.
Goods remain the property of the seller until payment is received in full. This document is issued
electronically and is valid without a signature.</p>
<p>Servisa adrese: Jelgavas iela 59, Rīga. Kontaktpersona: A. Bērziņš, tālr. +371 2000 0000.
Darba laiks: pirmdiena–piektdiena, 09:00–18:00. Svētku dienās serviss nestrādā.</p>
</body></html>`;

const CJK_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm }
body { font-family: 'Hiragino Sans', 'PingFang SC', 'Yu Gothic', sans-serif; font-size: 12pt; line-height: 1.7 }
h1 { font-size: 18pt; margin: 0 0 5mm }
</style></head><body>
<h1>中文技术说明</h1>
<p>这是一份用于测量字体覆盖范围的中文文档。文档中包含汉字、标点以及数字 1234567890。</p>
<p>第二段：编辑 PDF 中的文字时，子集字体里往往没有新字符的字形，因此需要回退到替代字体。</p>
<p>第三段：设备安装手册，包含尺寸、电压与工作温度等信息。</p>
<h1>日本語の技術説明</h1>
<p>これは日本語の文書です。漢字とかなと数字 12345 を含みます。PDF 内の文字を編集する研究用です。</p>
</body></html>`;

const RTL_HTML = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm }
body { font-family: 'Geeza Pro', 'Al Nile', 'Tahoma', sans-serif; font-size: 13pt; line-height: 1.9 }
h1 { font-size: 18pt; margin: 0 0 5mm }
</style></head><body>
<h1>عنوان الوثيقة التقنية</h1>
<p>هذا نص عربي لقياس تغطية الخطوط المضمّنة في ملفات PDF. يحتوي على أرقام ١٢٣٤٥٦٧٨٩٠.</p>
<p>الفقرة الثانية: عند تحرير النص داخل ملف PDF قد لا يحتوي الخط المضمّن على أشكال الحروف الجديدة.</p>
</body></html>`;

const CJK_TEXT = '日本語のテキストです。漢字とかなと数字 12345。\n編集可能なテキストを測定します。\n';
const ARABIC_TEXT = 'هذا نص عربي للاختبار والإصدار. تحرير النص داخل ملف PDF.\n';

const REPORTLAB_SOURCE = String.raw`
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
out = sys.argv[1]
c = canvas.Canvas(out, pagesize=A4)
w, h = A4
y = h - 60
c.setFont('Helvetica-Bold', 16); c.drawString(50, y, 'Standard 14 font document')
y -= 30
c.setFont('Times-Roman', 11)
lines = [
    'This page is drawn with the base 14 fonts, so no font program is embedded.',
    'Glyph programs live in the viewer, not in the file: reuse is impossible in principle.',
    'Latvian: Rigas iela 59, Jelgavas iela, samaksa, paraksts, ligums, adrese.',
]
for line in lines:
    c.drawString(50, y, line); y -= 16
y -= 10
c.setFont('Courier', 9)
for i in range(12):
    c.drawString(50, y, 'courier line %02d 0123456789 abcdefghijklmnopqrstuvwxyz' % (i + 1)); y -= 12
y -= 12
c.setFont('Helvetica', 10)
c.drawString(50, y, 'Table 1. Values'); y -= 14
for row in range(6):
    c.drawString(50, y, 'row %d' % row); c.drawRightString(w - 50, y, '%d.00 EUR' % (row * 37)); y -= 13
c.showPage()
c.setFont('Helvetica', 12); c.drawString(50, h - 60, 'Second page'); c.showPage()
c.save()
`;

const D = (rel) => path.join(ROOT, rel);
const HOME = os.homedir();

/**
 * The corpus. Categories follow the plan's list, with two documented substitutions:
 * `type1` stands in for LaTeX (no pdflatex/tectonic on this machine, so Computer Modern Type1
 * subsets cannot be produced; ReportLab/WeasyPrint Type1 subsets exercise the same code path), and
 * `own-output` is added because LocalPDF's own saves (Type3 text, Type1 refs) are the files users
 * edit most often in this product.
 */
const ENTRIES = [
  // --- office: Word / Excel / DevExpress exports -----------------------------------------------
  { id: 'office-install-guide', category: 'office', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/1592300081_Genius 20 Installation guide EN ver 1.01.pdf` },
  { id: 'office-quick-manual', category: 'office', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/5HL-201_Helpy_2W-TL_Quick_Manual_EN.pdf` },
  { id: 'office-invoice-devexpress', category: 'office', kind: 'copy', from: `${HOME}/Desktop/ul-coin SIA/Rekeni/Gramatvede/Rekins 2023_0210-001.pdf` },
  { id: 'office-invoice-ulcoin', category: 'office', kind: 'copy', from: `${HOME}/Desktop/ul-coin SIA/Rekeni/UL-COIN BA-23-450..pdf` },

  // --- html-print: Skia / WeasyPrint / generated Chrome print ----------------------------------
  { id: 'html-weasy-checklist', category: 'html-print', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /Genius20_Checklist_v2.pdf` },
  { id: 'html-skia-onepager', category: 'html-print', kind: 'copy', from: `${HOME}/Desktop/shadow/web/reports/outreach/flowboost-one-pager.pdf` },
  { id: 'html-skia-type3', category: 'html-print', kind: 'copy', from: `${HOME}/Downloads/data.pdf` },
  { id: 'gen-html-office', category: 'html-print', kind: 'chrome-print', html: OFFICE_HTML },
  { id: 'html-weasy-notice', category: 'html-print', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /lifts-tehniska-apkalposana-A4.pdf` },

  // --- type1: ReportLab / standard 14 -----------------------------------------------------------
  { id: 'type1-reportlab-checklist', category: 'type1', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /Check-list_LV_Jelgavas59_26.08.2026.pdf` },
  { id: 'type1-reportlab-journal', category: 'type1', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/Jelgavas59_lifta_dokumenti/03_Lifta_apkopes_zurnals_Jelgavas59.pdf` },
  { id: 'type1-standard-notembedded', category: 'type1', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/Jelgavas59_lifta_dokumenti/01_Kabines_norade_LV_EN_A4.pdf` },
  { id: 'type1-standard-printable', category: 'type1', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/Jelgavas59_lifta_dokumenti/02_Stava_pazinojums_lifts_nedarbojas_A4.pdf` },
  { id: 'gen-type1-base14', category: 'type1', kind: 'reportlab' },

  // --- scan: image-only and fontless files ------------------------------------------------------
  { id: 'scan-menu-198', category: 'scan', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/1595396514_OP_Genius20 menu.pdf` },
  { id: 'scan-manual-nofonts', category: 'scan', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/Helpy_2W-TL_User_Manual.pdf` },
  { id: 'scan-receipt', category: 'scan', kind: 'copy', from: `${HOME}/Desktop/localpdf-media/out/promos/receipt-scan.pdf` },

  // --- cjk --------------------------------------------------------------------------------------
  { id: 'gen-cjk-ja-cupsfilter', category: 'cjk', kind: 'cupsfilter', text: CJK_TEXT },
  { id: 'gen-cjk-chrome', category: 'cjk', kind: 'chrome-print', html: CJK_HTML },

  // --- rtl --------------------------------------------------------------------------------------
  { id: 'gen-rtl-ar-chrome', category: 'rtl', kind: 'chrome-print', html: RTL_HTML },
  { id: 'gen-rtl-ar-cupsfilter', category: 'rtl', kind: 'cupsfilter', text: ARABIC_TEXT },

  // --- signed -----------------------------------------------------------------------------------
  { id: 'signed-wc001', category: 'signed', kind: 'copy', from: `${HOME}/Desktop/фотки/20241018WC001.pdf` },
  { id: 'signed-rpt0580', category: 'signed', kind: 'copy', from: `${HOME}/Downloads/RPT_0580_par pieteik.izsk.RP_proces.ties_ar rezol_lēmumu_1.pdf` },

  // --- linearized -------------------------------------------------------------------------------
  { id: 'linearized-guide-ru', category: 'linearized', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/Guidarapida_Helpy 2W-V_KL_RU.pdf` },
  { id: 'linearized-vf7', category: 'linearized', kind: 'copy', from: `${HOME}/Desktop/KLEEMANN /kleemann_genius20/vf7_fd7242d2cca011eeac400492265b7a.pdf` },
  { id: 'gen-linearized-qpdf', category: 'linearized', kind: 'qpdf-linearize', fromEntry: 'gen-html-office' },

  // --- broken -----------------------------------------------------------------------------------
  { id: 'gen-broken-truncated', category: 'broken', kind: 'truncate', fromEntry: 'html-weasy-checklist', keep: 0.55 },
  { id: 'gen-broken-xref', category: 'broken', kind: 'corrupt-xref', fromEntry: 'html-skia-onepager' },
  { id: 'gen-broken-font', category: 'broken', kind: 'garble-font', fromEntry: 'gen-html-office' },

  // --- LocalPDF's own output --------------------------------------------------------------------
  { id: 'own-studio-reedit', category: 'own-output', kind: 'copy', from: D('test/fixtures/pdfs/documents/studio-reedit-demo.pdf') },
];

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, force: false, only: null, list: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') args.force = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--only') args.only = argv[++i];
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.slice(6));
    else if (arg.startsWith('--only=')) args.only = arg.slice(7);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function findChrome() {
  return CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

const chromePath = findChrome();

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, ...options });
}

async function chromePrint(entry, _source, target) {
  if (!chromePath) {
    throw new Error('Chrome not found: cannot generate this entry');
  }
  const htmlFile = path.join(BUILD_DIR, `${entry.id}.html`);
  await fs.writeFile(htmlFile, entry.html, 'utf8');
  // Chrome refuses to overwrite an existing --print-to-pdf target on some versions.
  await fs.rm(target, { force: true });
  run(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--no-pdf-header-footer',
    '--print-to-pdf-no-header',
    '--virtual-time-budget=2000',
    `--print-to-pdf=${target}`,
    `file://${htmlFile}`,
  ]);
}

async function cupsfilter(entry, _source, target) {
  const textFile = path.join(BUILD_DIR, `${entry.id}.txt`);
  await fs.writeFile(textFile, entry.text, 'utf8');
  const pdf = run('/usr/sbin/cupsfilter', ['-m', 'application/pdf', textFile]);
  await fs.writeFile(target, pdf);
}

async function reportlab(entry, _source, target) {
  const scriptFile = path.join(BUILD_DIR, `${entry.id}.py`);
  await fs.writeFile(scriptFile, REPORTLAB_SOURCE, 'utf8');
  run('python3', [scriptFile, target]);
}

async function qpdfLinearize(entry, from, target) {
  run('qpdf', ['--linearize', '--force-version=1.7', from, target]);
}

const truncate = async (entry, from, target) => {
  const bytes = await fs.readFile(from);
  await fs.writeFile(target, bytes.subarray(0, Math.floor(bytes.length * (entry.keep ?? 0.6))));
};

/** Corrupts the startxref offset: readers either recover by scanning or refuse the file. */
async function corruptXref(entry, from, target) {
  const bytes = await fs.readFile(from);
  const marker = Buffer.from('startxref');
  const at = bytes.lastIndexOf(marker);
  if (at < 0) {
    throw new Error('no startxref to corrupt');
  }
  const copy = Buffer.from(bytes);
  let cursor = at + marker.length;
  while (cursor < copy.length && (copy[cursor] === 0x0a || copy[cursor] === 0x0d || copy[cursor] === 0x20)) cursor += 1;
  const digitStart = cursor;
  while (cursor < copy.length && copy[cursor] >= 0x30 && copy[cursor] <= 0x39) cursor += 1;
  copy.write('9999999'.padEnd(cursor - digitStart, '9').slice(0, cursor - digitStart), digitStart, 'latin1');
  await fs.writeFile(target, copy);
}

/**
 * Fills the bytes of an embedded font program with zeros while keeping the stream length intact:
 * the PDF still opens, the program no longer parses. This is the "fontkit cannot read it" case the
 * measurement has to tolerate instead of crashing on.
 */
async function garbleFont(entry, from, target) {
  const bytes = Buffer.from(await fs.readFile(from));
  const key = Buffer.from('/FontFile2');
  const at = bytes.indexOf(key);
  if (at < 0) {
    throw new Error('no /FontFile2 to garble');
  }
  const streamAt = bytes.indexOf(Buffer.from('stream'), at);
  if (streamAt < 0) {
    throw new Error('no stream after /FontFile2');
  }
  const bodyStart = streamAt + 'stream'.length + (bytes[streamAt + 6] === 0x0d ? 2 : 1);
  const endAt = bytes.indexOf(Buffer.from('endstream'), bodyStart);
  const bodyEnd = endAt < 0 ? bytes.length : endAt;
  bytes.fill(0x00, bodyStart, Math.min(bodyEnd, bodyStart + 65_536));
  await fs.writeFile(target, bytes);
}

const GENERATED = {
  'chrome-print': chromePrint,
  cupsfilter,
  reportlab,
  'qpdf-linearize': qpdfLinearize,
  truncate,
  'corrupt-xref': corruptXref,
  'garble-font': garbleFont,
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected = ENTRIES.filter((entry) => !args.only || entry.category === args.only);

  if (args.list) {
    for (const entry of selected) {
      console.log(`${entry.category.padEnd(12)} ${entry.id.padEnd(28)} ${entry.kind}`);
    }
    console.log(`\n${selected.length} entries (${ENTRIES.length} total)`);
    return;
  }
  if (selected.length === 0) {
    throw new Error(`no entries match --only ${args.only}`);
  }

  await fs.mkdir(args.out, { recursive: true });
  await fs.mkdir(BUILD_DIR, { recursive: true });

  const built = [];
  const skipped = [];
  const target = (entry) => path.join(args.out, `${entry.id}.pdf`);

  for (const entry of selected) {
    const out = target(entry);
    const builtById = new Map(built.map((item) => [item.id, path.join(args.out, item.file)]));
    const source = entry.fromEntry ? builtById.get(entry.fromEntry) : entry.from;
    const sourceLabel = entry.fromEntry ? `#${entry.fromEntry}` : (entry.from ?? `<${entry.kind}>`);

    if (!args.force && await exists(out)) {
      const bytes = await fs.readFile(out);
      built.push({ id: entry.id, category: entry.category, file: path.basename(out), bytes: bytes.length, sha256: sha256(bytes), source: sourceLabel, generator: entry.kind, generated: entry.kind !== 'copy', reused: true });
      continue;
    }
    if (args.dryRun) {
      built.push({ id: entry.id, category: entry.category, file: path.basename(out), bytes: 0, sha256: null, source: sourceLabel, generator: entry.kind, generated: entry.kind !== 'copy', planned: true });
      continue;
    }

    try {
      if (entry.kind === 'copy') {
        if (!await exists(source)) {
          skipped.push({ id: entry.id, reason: `missing source ${source}` });
          continue;
        }
        await fs.copyFile(source, out);
      } else {
        const generator = GENERATED[entry.kind];
        if (!generator) {
          throw new Error(`unknown kind ${entry.kind}`);
        }
        if (source && !await exists(source)) {
          skipped.push({ id: entry.id, reason: `missing input ${source}` });
          continue;
        }
        await generator(entry, source, out);
      }
      const bytes = await fs.readFile(out);
      if (bytes.length === 0) {
        throw new Error('generator produced an empty file');
      }
      built.push({ id: entry.id, category: entry.category, file: path.basename(out), bytes: bytes.length, sha256: sha256(bytes), source: sourceLabel, generator: entry.kind, generated: entry.kind !== 'copy' });
      console.log(`  ok    ${entry.category.padEnd(12)} ${entry.id.padEnd(30)} ${(bytes.length / 1024).toFixed(0)}KB`);
    } catch (error) {
      skipped.push({ id: entry.id, reason: error.message.split('\n')[0] });
      console.log(`  skip  ${entry.category.padEnd(12)} ${entry.id.padEnd(30)} ${error.message.split('\n')[0]}`);
    }
  }

  const manifest = {
    builtAt: new Date().toISOString(),
    corpusVersion: 1,
    note: 'Local measurement corpus for the font-reuse baseline. PDFs are gitignored; this manifest is the provenance record.',
    entries: built,
    skipped,
    totals: {
      entries: built.length,
      categories: [...new Set(built.map((item) => item.category))].sort(),
      bytes: built.reduce((sum, item) => sum + item.bytes, 0),
    },
  };
  await fs.writeFile(path.join(args.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const byCategory = new Map();
  for (const item of built) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
  }
  console.log(`\ncorpus: ${built.length} files, ${(manifest.totals.bytes / 1024 / 1024).toFixed(1)}MB -> ${path.relative(ROOT, args.out)}`);
  console.log([...byCategory].sort().map(([category, count]) => `${category}=${count}`).join(' '));
  if (skipped.length > 0) {
    console.log(`skipped ${skipped.length}: ${skipped.map((item) => item.id).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
