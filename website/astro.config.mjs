import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

const sitemapBlockedPaths = new Set([
  'https://localpdf.online/blog/add-text-to-pdf-guide',
  'https://localpdf.online/blog/email-pdf-attachments',
  'https://localpdf.online/blog/flatten-pdf-forms',
  'https://localpdf.online/blog/pdf-optimization-guide',
  'https://localpdf.online/blog/protect-pdf-with-password',
]);

const TODAY = new Date().toISOString().split('T')[0];

const sitemapPriority = {
  'https://localpdf.online/':              { priority: 1.0,  changefreq: 'weekly'  },
  'https://localpdf.online':               { priority: 1.0,  changefreq: 'weekly'  },
  'https://localpdf.online/pricing':       { priority: 0.9,  changefreq: 'monthly' },
  'https://localpdf.online/features/ocr-pdf':      { priority: 0.9, changefreq: 'monthly' },
  'https://localpdf.online/features/edit-pdf':     { priority: 0.9, changefreq: 'monthly' },
  'https://localpdf.online/features/compress-pdf': { priority: 0.8, changefreq: 'monthly' },
  'https://localpdf.online/features/merge-pdf':    { priority: 0.8, changefreq: 'monthly' },
  'https://localpdf.online/features/split-pdf':    { priority: 0.7, changefreq: 'monthly' },
  'https://localpdf.online/features/convert-pdf':  { priority: 0.7, changefreq: 'monthly' },
  'https://localpdf.online/features/sign-pdf':     { priority: 0.7, changefreq: 'monthly' },
  'https://localpdf.online/security':      { priority: 0.8,  changefreq: 'monthly' },
  'https://localpdf.online/faq':           { priority: 0.7,  changefreq: 'monthly' },
  'https://localpdf.online/private-pdf-editor':    { priority: 0.7, changefreq: 'monthly' },
};

const sitemapAllowList = new Set([
  'https://localpdf.online',
  'https://localpdf.online/',
  'https://localpdf.online/about',
  'https://localpdf.online/blog',
  'https://localpdf.online/privacy',
  'https://localpdf.online/terms',
  'https://localpdf.online/faq',
  'https://localpdf.online/security',
  'https://localpdf.online/features/edit-pdf',
  'https://localpdf.online/features/merge-pdf',
  'https://localpdf.online/features/ocr-pdf',
  'https://localpdf.online/features/compress-pdf',
  'https://localpdf.online/features/split-pdf',
  'https://localpdf.online/features/sign-pdf',
  'https://localpdf.online/features/convert-pdf',
  'https://localpdf.online/pricing',
  'https://localpdf.online/private-pdf-editor',
  'https://localpdf.online/pdf-tools-without-upload',
  'https://localpdf.online/refund-policy',
  'https://localpdf.online/how-local-pdf-processing-works',
]);

// https://astro.build/config
export default defineConfig({
  site: 'https://localpdf.online',
  integrations: [
    mdx(),
    sitemap({
      filter: (page) =>
        !sitemapBlockedPaths.has(page) &&
        (
          sitemapAllowList.has(page) ||
          page.startsWith('https://localpdf.online/blog/') ||
          page.includes('/compare/') ||
          page.includes('/use-cases/')
        ),
      customPages: [],
      serialize: (item) => {
        const meta = sitemapPriority[item.url];
        return {
          ...item,
          lastmod: TODAY,
          ...(meta || { priority: 0.6, changefreq: 'monthly' }),
        };
      },
    })
  ],
  output: 'static',
  build: {
    format: 'file'
  },
  vite: {
    envDir: '..',
    envPrefix: ['VITE_', 'PUBLIC_'],
    server: {
      fs: {
        allow: ['..']
      }
    },
    build: {
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name].[hash][extname]',
        },
      },
    },
  },
});
