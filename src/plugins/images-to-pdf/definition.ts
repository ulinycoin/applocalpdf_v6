import type { IToolDefinition } from '../../core/types/contracts';

export const IMAGES_TO_PDF_FREE_LIMIT = 5;
export const IMAGES_TO_PDF_PRO_LIMIT = 200;

export const imagesToPdfDefinition: IToolDefinition = {
  id: 'images-to-pdf',
  name: 'Images to PDF',
  description: 'Combine JPG, PNG, or WebP images into one PDF document.',
  entitlements: [],
  limits: {
    featureTier: 'basic',
    maxFileSize: { free: 15 * 1024 * 1024, pro: 100 * 1024 * 1024 },
  },
  uiLoader: () => import('./ui'),
  logicLoader: () => import('./logic'),
};
