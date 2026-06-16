import { validateApiKey, incrementUsage } from '../src/core/api/api-key-manager';
import { processPdf, type ProcessOptions } from '../src/core/api/server-processor';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function resolveFileInput(fileInput: string): Promise<Buffer> {
  if (fileInput.startsWith('http://') || fileInput.startsWith('https://')) {
    return downloadFile(fileInput);
  }
  return Buffer.from(fileInput, 'base64');
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers?.['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'x-api-key header required' });
  }

  try {
    const validation = await validateApiKey(apiKey);
    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    const { file, tool, options } = req.body || {};

    if (!file || typeof file !== 'string') {
      return res.status(400).json({ error: 'file (base64 or URL) is required' });
    }

    if (!tool || typeof tool !== 'string') {
      return res.status(400).json({ error: 'tool is required' });
    }

    const validTools = ['compress', 'ocr', 'sign'];
    if (!validTools.includes(tool)) {
      return res.status(400).json({ error: `Invalid tool. Valid: ${validTools.join(', ')}` });
    }

    const fileBytes = await resolveFileInput(file);
    const tier = validation.record!.tier;
    const maxBytes = tier === 'free' ? 1 * 1024 * 1024 : MAX_FILE_SIZE;

    if (fileBytes.length > maxBytes) {
      return res.status(413).json({
        error: `File too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB for ${tier} tier`,
      });
    }

    await incrementUsage(validation.userId!, validation.record!.keyHash);

    const processOptions: ProcessOptions = {
      quality: options?.quality || 'medium',
      languages: options?.languages || ['eng'],
      signatureImage: options?.signatureImage,
      signaturePosition: options?.signaturePosition,
    };

    const fileBase64 = fileBytes.toString('base64');
    const result = await processPdf(fileBase64, tool, processOptions);

    return res.status(200).json({
      success: true,
      file: result.file,
      stats: result.stats,
    });
  } catch (err: any) {
    console.error('Process error:', err);
    return res.status(500).json({
      error: err?.message || 'Processing failed',
    });
  }
}
