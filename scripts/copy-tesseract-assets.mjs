#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targetRoot = path.join(rootDir, 'public', 'vendor', 'tesseract');
const targetCoreDir = path.join(targetRoot, 'core');
const targetLangDir = path.join(targetRoot, 'lang');
const sourceWorkerDir = path.join(rootDir, 'node_modules', 'tesseract.js', 'dist');
const sourceCoreDir = path.join(rootDir, 'node_modules', 'tesseract.js-core');
const sourceLangPackageRoot = path.join(rootDir, 'node_modules', '@tesseract.js-data');

const coreFiles = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
  'tesseract-core.wasm.js',
  'tesseract-core.wasm',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd.wasm',
];

const languagePacks = [
  'eng',
  'rus',
  'ukr',
  'deu',
  'fra',
  'spa',
  'ita',
  'por',
  'jpn',
  'chi_sim',
  'hin',
  'ara',
];

function copyFile(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing Tesseract asset: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function main() {
  copyFile(path.join(sourceWorkerDir, 'worker.min.js'), path.join(targetRoot, 'worker.min.js'));
  for (const file of coreFiles) {
    copyFile(path.join(sourceCoreDir, file), path.join(targetCoreDir, file));
  }
  for (const language of languagePacks) {
    copyFile(
      path.join(sourceLangPackageRoot, language, '4.0.0', `${language}.traineddata.gz`),
      path.join(targetLangDir, `${language}.traineddata.gz`),
    );
  }
  console.log('Copied Tesseract worker/core assets to public/vendor/tesseract');
}

main();
