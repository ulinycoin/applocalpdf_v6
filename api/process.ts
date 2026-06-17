import { createHash } from 'node:crypto';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const MAX_FILE_SIZE = 50 * 1024 * 1024;

async function redis(command: string[]): Promise<any> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error('Redis not configured');
  }
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  return res.json();
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function validateApiKey(key: string) {
  if (!key.startsWith('lp_live_')) return null;
  const keyHash = hashKey(key);
  const userIdRes = await redis(['GET', `apikey:${keyHash}`]);
  const userId = userIdRes?.result;
  if (!userId) return null;
  const recordRes = await redis(['HGET', `apikeys:${userId}`, keyHash]);
  if (!recordRes?.result) return null;
  return { userId, record: JSON.parse(recordRes.result) };
}

async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

async function resolveFileInput(fileInput: string): Promise<Buffer> {
  if (fileInput.startsWith('http://') || fileInput.startsWith('https://')) {
    return downloadFile(fileInput);
  }
  return Buffer.from(fileInput, 'base64');
}

async function processPdf(fileBase64: string, tool: string, options: any = {}) {
  const { PDFDocument } = await import('pdf-lib');
  const startTime = Date.now();
  const inputBytes = Buffer.from(fileBase64, 'base64');
  let outputBytes: Uint8Array;

  switch (tool) {
    case 'compress': {
      const doc = await PDFDocument.load(inputBytes);
      outputBytes = await doc.save({ useObjectStreams: options.quality !== 'low' });
      break;
    }
    case 'ocr': {
      const { createWorker } = await import('tesseract.js');
      const doc = await PDFDocument.load(inputBytes);
      const worker = await createWorker(options.languages?.join('+') || 'eng');
      const embedFont = await doc.embedFont('Helvetica');

      for (let i = 0; i < doc.getPageCount(); i++) {
        const page = doc.getPage(i);
        const { width, height } = page.getSize();
        const imgPage = await PDFDocument.create();
        await imgPage.embedPdf(doc, [i]);
        const imgBytes = await imgPage.save();
        const { data } = await worker.recognize(Buffer.from(imgBytes));
        for (const line of data.lines || []) {
          const { bbox, text } = line;
          if (!text.trim()) continue;
          const h = bbox.y1 - bbox.y0;
          const fontSize = Math.max(8, Math.min(24, h * 0.8));
          page.drawText(text, {
            x: Math.max(0, Math.min(bbox.x0, width - 50)),
            y: Math.max(fontSize, Math.min(height - bbox.y0 - fontSize, height - fontSize)),
            size: fontSize, font: embedFont, opacity: 0,
          });
        }
      }
      await worker.terminate();
      outputBytes = await doc.save();
      break;
    }
    case 'sign': {
      if (!options.signatureImage) throw new Error('signatureImage required for sign');
      const doc = await PDFDocument.load(inputBytes);
      const sigBytes = Buffer.from(options.signatureImage, 'base64');
      const sigImage = await doc.embedPng(sigBytes);
      const pos = options.signaturePosition || { x: 100, y: 100, page: 0 };
      const page = doc.getPage(pos.page || 0);
      const { width, height } = page.getSize();
      const sigW = Math.min(200, width * 0.3);
      const sigH = sigW * (sigImage.height / sigImage.width);
      page.drawImage(sigImage, {
        x: Math.max(0, Math.min(pos.x, width - sigW)),
        y: Math.max(0, Math.min(pos.y, height - sigH)),
        width: sigW, height: sigH,
      });
      outputBytes = await doc.save();
      break;
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }

  return {
    file: Buffer.from(outputBytes!).toString('base64'),
    stats: {
      inputSize: inputBytes.length,
      outputSize: outputBytes!.length,
      processingTimeMs: Date.now() - startTime,
    },
  };
}

export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).json({});
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers?.['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'x-api-key required' });

  try {
    const validation = await validateApiKey(apiKey);
    if (!validation) return res.status(401).json({ error: 'Invalid API key' });

    const { file, tool, options } = req.body || {};
    if (!file) return res.status(400).json({ error: 'file required' });
    if (!tool) return res.status(400).json({ error: 'tool required' });

    const validTools = ['compress', 'ocr', 'sign'];
    if (!validTools.includes(tool)) return res.status(400).json({ error: `Invalid tool. Use: ${validTools.join(', ')}` });

    const fileBytes = await resolveFileInput(file);
    const maxBytes = validation.record.tier === 'free' ? 1 * 1024 * 1024 : MAX_FILE_SIZE;
    if (fileBytes.length > maxBytes) {
      return res.status(413).json({ error: `File too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB for ${validation.record.tier}` });
    }

    const result = await processPdf(fileBytes.toString('base64'), tool, options);
    return res.status(200).json({ success: true, file: result.file, stats: result.stats });
  } catch (err: any) {
    console.error('Process error:', err);
    return res.status(500).json({ error: err?.message || 'Processing failed' });
  }
}
