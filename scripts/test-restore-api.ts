import handler from '../api/billing/restore.ts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testRestore() {
  const licenseKey = '577C420B-E186-4D97-A937-6781A7EA2B34';
  
  console.log('Testing restore with key:', licenseKey);
  console.log('Using API Key:', process.env.LEMON_SQUEEZY_API_KEY ? 'Set' : 'MISSING');
  console.log('Using Private Key:', process.env.JWT_PRIVATE_KEY ? 'Set' : 'MISSING');

  const req = {
    method: 'POST',
    body: { licenseKey },
    headers: {}
  };

  const res = {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    statusCode: 200,
    body: null
  };

  try {
    await handler(req as any, res as any);
    console.log('\nResponse Code:', res.statusCode);
    console.log('Response Body:', JSON.stringify(res.body, null, 2));
  } catch (error) {
    console.error('\nExecution Error:', error);
  }
}

testRestore();
