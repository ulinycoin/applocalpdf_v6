import type { IToolDefinition } from '../../core/types/contracts';

export const autoTocDefinition: IToolDefinition = {
    id: 'auto-toc',
    name: 'Auto-TOC & Bookmarks',
    description: 'Automatically detect headings in your PDF and generate an interactive table of contents with bookmarks.',
    entitlements: [],
    limits: {
        featureTier: 'basic',
        maxFileSize: { free: 50 * 1024 * 1024, pro: 500 * 1024 * 1024 },
    },
    uiLoader: () => import('./ui'),
    logicLoader: () => import('./logic'),
    layout: 'default',
    premiumVisuals: true,
};
