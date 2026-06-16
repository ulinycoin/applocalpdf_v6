import { validateApiKey, incrementUsage } from '../../src/core/api/api-key-manager';
import { processPdf, type ProcessOptions } from '../../src/core/api/server-processor';

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
      return res.status(400).json({ error: 'file (base64) is required' });
    }

    if (!tool || typeof tool !== 'string') {
      return res.status(400).json({ error: 'tool is required' });
    }

    const validTools = ['compress', 'ocr', 'sign'];
    if (!validTools.includes(tool)) {
      return res.status(400).json({ error: `Invalid tool. Valid: ${validTools.join(', ')}` });
    }

    const fileBytes = Buffer.from(file, 'base64');
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

    const result = await processPdf(file, tool, processOptions);

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
