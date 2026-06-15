import type { IToolDefinition } from '../../core/types/contracts';

export const sharePdfDefinition: IToolDefinition = {
  id: 'share-pdf',
  name: 'Share to Phone',
  description: 'Securely send your PDF to a mobile phone using a temporary end-to-end encrypted QR-code.',
  entitlements: ['pdf.protect.unlock'], // Use a generic entitlement already allowed in standard profiles
  limits: {
    featureTier: 'basic',
    maxFileSize: { free: 50 * 1024 * 1024, pro: 500 * 1024 * 1024 },
  },
  uiLoader: () => import('./ui'),
  logicLoader: () => import('./logic'),
};
