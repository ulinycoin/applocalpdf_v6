import type { IToolDefinition } from '../../core/types/contracts';

export const ocrPdfDefinition: IToolDefinition = {
  id: 'ocr-pdf',
  name: 'OCR PDF',
  description: 'Recognize text in scanned PDF files.',
  entitlements: ['pdf.ocr'],
  limits: {
    featureTier: 'pro',
    maxFileSize: { free: 10 * 1024 * 1024, pro: 150 * 1024 * 1024 },
    maxPagesPerFile: { free: 50, pro: 1000 },
    monthlyQuota: { free: 0, pro: 200 },
  },
  uiLoader: () => import('./ui'),
  logicLoader: () => import('./logic'),
};
