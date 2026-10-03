#!/usr/bin/env node

/**
 * Copies the Noto subsets the Studio text editor embeds into `public/fonts/`.
 *
 * They used to be pulled in with Vite-only `?url` imports, which made the font pipeline impossible
 * to exercise outside a Vite build (unit tests silently ran without any embedded face) and tied the
 * URLs to hashed asset names. Serving them from `public/fonts/` keeps the same bytes in the bundle
 * while letting the applier build one base-path-aware URL, exactly like Roboto.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourceDir = path.join(rootDir, 'node_modules', '@fontsource', 'noto-sans', 'files');
const targetDir = path.join(rootDir, 'public', 'fonts');

const subsets = [
  'latin',
  'latin-ext',
  'cyrillic',
  'greek',
  'devanagari',
];

fs.mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const subset of subsets) {
  const fileName = `noto-sans-${subset}-400-normal.woff`;
  const source = path.join(sourceDir, fileName);
  if (!fs.existsSync(source)) {
    // A missing subset only costs that script its dedicated face; the full Roboto face still covers
    // Latin, Latin-Ext and Cyrillic, so this is a warning rather than a build failure.
    console.warn(`[studio-fonts] missing subset: ${fileName}`);
    continue;
  }
  const target = path.join(targetDir, `noto-sans-${subset}-400.woff`);
  fs.copyFileSync(source, target);
  copied += 1;
}

console.log(`[studio-fonts] copied ${copied} Noto subset(s) to public/fonts`);
