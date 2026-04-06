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
