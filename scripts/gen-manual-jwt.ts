import { createSign, type KeyLike } from 'node:crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function encodeBase64Url(buffer: Buffer | Uint8Array): string {
    return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeUtf8Base64Url(str: string): string {
    return encodeBase64Url(Buffer.from(str, 'utf8'));
}

async function signJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
    const headerStr = encodeUtf8Base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payloadStr = encodeUtf8Base64Url(JSON.stringify(payload));
    const dataToSign = `${headerStr}.${payloadStr}`;
    const signer = createSign('RSA-SHA256');
    signer.update(dataToSign);
    signer.end();
    const signature = signer.sign(privateKeyPem as unknown as KeyLike);
    return `${dataToSign}.${encodeBase64Url(signature)}`;
}

async function generateManualToken() {
    const privateKey = process.env.JWT_PRIVATE_KEY;
    if (!privateKey) {
        console.error('JWT_PRIVATE_KEY missing!');
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + (60 * 60 * 24 * 30);
    
    const claims = {
        iss: 'localpdf-billing',
        aud: 'localpdf-v6',
        sub: 'manually-generated-test-token',
        plan: 'pro',
        tier: 'pro_monthly',
        entitlements: {
            "maxWorkspaces": Infinity,
            "maxPagesPerDocument": Infinity,
            "ocrEnabled": true,
            "editEnabled": true,
            "exportEnabled": true
        },
        iat: now,
        nbf: now,
        exp,
    };

    const token = await signJwt(claims, privateKey);
    console.log('--- MANUALLY GENERATED TOKEN ---');
    console.log(token);
    console.log('--------------------------------');
}

generateManualToken();
