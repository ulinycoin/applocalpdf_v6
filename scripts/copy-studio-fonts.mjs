#!/usr/bin/env node

/**
 * Copies the Noto subsets the Studio text editor embeds into `public/fonts/`.
 *
 * They used to be pulled in with Vite-only `?url` imports, which made the font pipeline impossible
 * to exercise outside a Vite build (unit tests silently ran without any embedded face) and tied the
 * URLs to hashed asset names. Serving them from `public/fonts/` keeps the same bytes in the bundle
 * while letting the applier build one base-path-aware URL, exactly like Roboto.
 *
 * Latin/Latin-Ext/Cyrillic/Greek/Devanagari come from the `@fontsource/noto-sans` checkout. Arabic
 * and Hebrew are not part of that package, so their OFL subsets are committed under
 * `scripts/assets/studio-fonts/` (Google Fonts via `@fontsource/noto-sans-arabic` and
 * `@fontsource/noto-sans-hebrew`, v5.3.0) and the script picks them up from there. Anything that is
 * still uncovered — notably CJK, whose smallest complete face is ~9.6 MB — stays raster text.
 *
 * The script never touches the network: the committed assets are the source of truth.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const fontsourceDir = path.join(rootDir, 'node_modules', '@fontsource');
const assetDir = path.join(rootDir, 'scripts', 'assets', 'studio-fonts');
const targetDir = path.join(rootDir, 'public', 'fonts');

/**
 * `fontPackage` names a `@fontsource/*` package and `subset` the unicode-range slice inside it; the
 * committed asset is used instead whenever one exists, so an `npm ci`-less checkout still works.
 */
const subsets = [
  { subset: 'latin', fontPackage: 'noto-sans' },
  { subset: 'latin-ext', fontPackage: 'noto-sans' },
  { subset: 'cyrillic', fontPackage: 'noto-sans' },
  { subset: 'greek', fontPackage: 'noto-sans' },
  { subset: 'devanagari', fontPackage: 'noto-sans' },
  { subset: 'arabic', fontPackage: 'noto-sans-arabic' },
  { subset: 'hebrew', fontPackage: 'noto-sans-hebrew' },
];

fs.mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const { subset, fontPackage } of subsets) {
  const targetName = `noto-sans-${subset}-400.woff`;
  const asset = path.join(assetDir, targetName);
  const installed = path.join(fontsourceDir, fontPackage, 'files', `noto-sans-${subset}-400-normal.woff`);
  const source = fs.existsSync(asset) ? asset : installed;
  if (!fs.existsSync(source)) {
    // A missing subset only costs that script its dedicated face; the full Roboto face still covers
    // Latin, Latin-Ext and Cyrillic, so this is a warning rather than a build failure.
    console.warn(`[studio-fonts] missing subset: ${targetName}`);
    continue;
  }
  fs.copyFileSync(source, path.join(targetDir, targetName));
  copied += 1;
}

console.log(`[studio-fonts] copied ${copied} Noto subset(s) to public/fonts`);
