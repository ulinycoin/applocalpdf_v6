const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Read .env manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const privateKeyMatch = envContent.match(/JWT_PRIVATE_KEY="([^"]+)"/) || envContent.match(/JWT_PRIVATE_KEY=([^\s]+)/);
const privateKey = privateKeyMatch ? privateKeyMatch[1].replace(/\\n/g, '\n') : null;

if (!privateKey) {
  console.error('JWT_PRIVATE_KEY not found in .env');
  process.exit(1);
}

function encodeBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeUtf8Base64Url(str) {
  return encodeBase64Url(Buffer.from(str, 'utf8'));
}

function signJwt(payload, privateKeyPem) {
  const headerStr = encodeUtf8Base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payloadStr = encodeUtf8Base64Url(JSON.stringify(payload));
  const dataToSign = `${headerStr}.${payloadStr}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(dataToSign);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${dataToSign}.${encodeBase64Url(signature)}`;
}

const now = Math.floor(Date.now() / 1000);
const exp = now + (60 * 60 * 24 * 30);

const claims = {
  iss: 'localpdf-billing',
  aud: 'localpdf-v6',
  sub: 'manual-test-activation',
  plan: 'pro',
  tier: 'pro_monthly',
  entitlements: {
    maxWorkspaces: 1000,
    maxPagesPerDocument: 1000,
    ocrEnabled: true,
    editEnabled: true,
    exportEnabled: true
  },
  iat: now,
  nbf: now,
  exp
};

const token = signJwt(claims, privateKey);
console.log(token);
