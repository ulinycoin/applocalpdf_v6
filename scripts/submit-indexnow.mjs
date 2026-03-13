#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const SITE_HOST = 'https://localpdf.online';
const KEY = 'be13ab7c5d7548a1b51e5ce3c969af42';
const KEY_LOCATION = `${SITE_HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

function printUsage() {
  console.log(`Usage:
  npm run indexnow:submit -- --url https://localpdf.online/page
  npm run indexnow:submit -- --file path/to/urls.txt

Options:
  --url   Submit a single absolute URL. Repeatable.
  --file  Submit newline-delimited URLs from a text file.
`);
}

function readArgValues(flag, args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
      }
      values.push(value);
      index += 1;
    }
  }
  return values;
}

function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.origin !== SITE_HOST) {
    throw new Error(`URL must belong to ${SITE_HOST}: ${rawUrl}`);
  }
  url.hash = '';
  return url.toString();
}

function loadUrlsFromFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function submitUrls(urls) {
  const payload = {
    host: 'localpdf.online',
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`IndexNow request failed (${response.status}): ${responseText}`);
  }

  console.log(`Submitted ${urls.length} URL(s) to IndexNow.`);
  if (responseText) {
    console.log(responseText);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const directUrls = readArgValues('--url', args);
  const fileArgs = readArgValues('--file', args);

  const allUrls = [
    ...directUrls,
    ...fileArgs.flatMap((filePath) => loadUrlsFromFile(filePath)),
  ];

  if (allUrls.length === 0) {
    printUsage();
    throw new Error('Provide at least one --url or --file.');
  }

  const normalizedUrls = [...new Set(allUrls.map(normalizeUrl))];
  await submitUrls(normalizedUrls);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
