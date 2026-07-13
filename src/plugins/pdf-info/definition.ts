import type { IToolDefinition } from '../../core/types/contracts';

export const pdfInfoDefinition: IToolDefinition = {
  id: 'pdf-info',
  name: 'PDF Info',
  description: 'Inspect PDF structure locally — pages, version, encryption, fonts, and metadata.',
  entitlements: [],
  limits: {
    featureTier: 'basic',
    maxFileSize: { free: 50 * 1024 * 1024, pro: 500 * 1024 * 1024 },
    maxPagesPerFile: { free: 500, pro: 5000 },
  },
  uiLoader: () => import('./ui'),
  logicLoader: () => import('./logic'),
};
