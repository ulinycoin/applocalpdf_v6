#!/usr/bin/env node

import { createPrivateKey, createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(envPath);

const errors = [];
const warnings = [];
const checks = [];

function ok(message) {
  checks.push(`✓ ${message}`);
}

function warn(message) {
  warnings.push(`⚠ ${message}`);
}

function fail(message) {
  errors.push(`✗ ${message}`);
}

function getEnv(name) {
  return process.env[name]?.trim() ?? '';
}

function requireEnv(name, description) {
  const value = getEnv(name);
  if (!value) {
    fail(`${name} is missing (${description})`);
    return '';
  }
  ok(`${name} is set`);
  return value;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isRelativePath(value) {
  return value.startsWith('/');
}

function parseCsvSet(value) {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
}

function validateAllowlist(name) {
  const raw = requireEnv(name, 'comma-separated LemonSqueezy allowlist');
  if (!raw) return [];
  const values = parseCsvSet(raw);
  if (values.length === 0) {
    fail(`${name} has no usable values`);
    return [];
  }
  const invalid = values.filter((value) => !/^\d+$/.test(value));
  if (invalid.length > 0) {
    fail(`${name} must contain only numeric IDs; invalid values: ${invalid.join(', ')}`);
  } else {
    ok(`${name} contains ${values.length} numeric id${values.length === 1 ? '' : 's'}`);
  }
  return values;
}

const billingDestination = requireEnv('VITE_BILLING_URL', 'billing destination for upsell flows');
if (billingDestination) {
  if (isRelativePath(billingDestination) || isHttpsUrl(billingDestination)) {
    ok('VITE_BILLING_URL is a safe relative path or HTTPS URL');
  } else {
    fail('VITE_BILLING_URL must be a relative path like /pricing or an HTTPS URL');
  }
}

for (const key of ['VITE_LS_CHECKOUT_URL_PRO_MONTHLY', 'VITE_LS_CHECKOUT_URL_PRO_YEARLY']) {
  const value = requireEnv(key, 'hosted LemonSqueezy checkout URL');
  if (!value) continue;
  if (isHttpsUrl(value)) {
    ok(`${key} is an HTTPS URL`);
  } else {
    fail(`${key} must be an absolute HTTPS URL`);
  }
}

const publicPem = requireEnv('VITE_PUBLIC_JWT_KEY', 'frontend JWT public key in PEM format');
const privatePem = requireEnv('JWT_PRIVATE_KEY', 'server JWT private key in PEM format');
requireEnv('LEMON_SQUEEZY_API_KEY', 'server-side LemonSqueezy API key');

if (publicPem && !publicPem.includes('BEGIN PUBLIC KEY')) {
  fail('VITE_PUBLIC_JWT_KEY must be a PEM public key');
}
if (privatePem && !privatePem.includes('BEGIN')) {
  fail('JWT_PRIVATE_KEY must be a PEM private key');
}

if (publicPem && privatePem) {
  try {
    const derivedPublicPem = createPublicKey(createPrivateKey(privatePem)).export({ type: 'spki', format: 'pem' }).toString().trim();
    const normalizedPublicPem = publicPem.trim().replace(/\r\n/g, '\n');
    const normalizedDerivedPem = derivedPublicPem.replace(/\r\n/g, '\n');
    if (normalizedPublicPem === normalizedDerivedPem) {
      ok('JWT public/private keys match');
    } else {
      fail('VITE_PUBLIC_JWT_KEY does not match JWT_PRIVATE_KEY');
    }
  } catch (error) {
    fail(`Unable to parse JWT key material: ${error.message}`);
  }
}

const monthlyProducts = validateAllowlist('LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS');
const monthlyVariants = validateAllowlist('LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS');
const yearlyProducts = validateAllowlist('LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS');
const yearlyVariants = validateAllowlist('LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS');

function ensureNoOverlap(labelA, valuesA, labelB, valuesB, severity = 'error') {
  const overlap = valuesA.filter((value) => valuesB.includes(value));
  if (overlap.length === 0) return;
  const message = `${labelA} and ${labelB} overlap: ${overlap.join(', ')}`;
  if (severity === 'warning') {
    warn(message);
    return;
  }
  fail(message);
}

ensureNoOverlap('monthly product ids', monthlyProducts, 'yearly product ids', yearlyProducts, 'warning');
ensureNoOverlap('monthly variant ids', monthlyVariants, 'yearly variant ids', yearlyVariants);

const publicAppUrl = getEnv('PUBLIC_APP_URL');
if (!publicAppUrl) {
  warn('PUBLIC_APP_URL is not set; this is acceptable locally but production should set it');
} else if (!isHttpsUrl(publicAppUrl)) {
  fail('PUBLIC_APP_URL must be an HTTPS URL');
} else {
  ok('PUBLIC_APP_URL is an HTTPS URL');
}

console.log('\nLocalPDF billing preflight\n');
for (const line of checks) console.log(line);
for (const line of warnings) console.log(line);
for (const line of errors) console.log(line);

if (errors.length > 0) {
  console.error(`\nBilling preflight failed with ${errors.length} error${errors.length === 1 ? '' : 's'}.`);
  process.exit(1);
}

console.log(`\nBilling preflight passed${warnings.length > 0 ? ` with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}.`);
