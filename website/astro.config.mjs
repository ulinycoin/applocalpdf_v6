import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { NOINDEX_BLOG_SITEMAP_URLS } from './src/data/noindexBlog.ts';
import { featurePages } from './src/data/featurePages.ts';

const SITE_ORIGIN = 'https://localpdf.online';

/**
 * Canvas demo clips per page, emitted as <video:video> entries so the recordings can be
 * indexed as video. Pages that render no clip stay out of it. Google requires a thumbnail,
 * title and description for every entry — title is truncated to its 100-character limit.
 */
const CANVAS_DEMO_VIDEOS = {
  '/': [
    {
      src: '/demo/localpdf-drag-pages-between-documents.mp4',
      poster: '/demo/localpdf-drag-pages-between-documents-poster.webp',
      title: 'Drag pages between PDF documents on one canvas',
      description: 'A page dragged from one workspace into another. Recorded from the running app.',
    },
  ],
  '/private-pdf-editor': [
    {
      src: '/demo/localpdf-redact-pdf-whiteout.mp4',
      poster: '/demo/localpdf-redact-pdf-whiteout-poster.webp',
      title: 'Erase sensitive content with whiteout',
      description: 'Redacting an account line on the page. Recorded from the running app.',
    },
  ],
};

const clampTitle = (value) => (value.length <= 100 ? value : `${value.slice(0, 97)}...`);

const demoVideosByUrl = new Map(
  Object.entries(CANVAS_DEMO_VIDEOS).map(([path, videos]) => [new URL(path, SITE_ORIGIN).href, videos]),
);

for (const page of featurePages) {
  if (!page.demoVideos?.length) continue;
  demoVideosByUrl.set(
    new URL(`/features/${page.slug}`, SITE_ORIGIN).href,
    page.demoVideos.map((demo) => ({
      src: demo.src,
      poster: demo.poster,
      title: demo.alt,
      description: demo.caption,
    })),
  );
}

const sitemapBlockedPaths = new Set([
  // Legacy removed guides (archive routes, not in content/)
  'https://localpdf.online/blog/add-text-to-pdf-guide',
  'https://localpdf.online/blog/email-pdf-attachments',
  'https://localpdf.online/blog/flatten-pdf-forms',
  'https://localpdf.online/blog/pdf-optimization-guide',
  'https://localpdf.online/blog/protect-pdf-with-password',
  // All cannibal / zero-app blog posts + hub
  ...NOINDEX_BLOG_SITEMAP_URLS,
  'https://localpdf.online/blog',
]);

const TODAY = new Date().toISOString().split('T')[0];

const sitemapPriority = {
  'https://localpdf.online/':              { priority: 1.0,  changefreq: 'weekly'  },
  'https://localpdf.online':               { priority: 1.0,  changefreq: 'weekly'  },
  'https://localpdf.online/ja':            { priority: 1.0,  changefreq: 'weekly'  },
  'https://localpdf.online/zh':            { priority: 1.0,  changefreq: 'weekly'  },
  'https://localpdf.online/features/auto-toc-pdf': { priority: 0.8, changefreq: 'monthly' },
  'https://localpdf.online/features':       { priority: 0.8, changefreq: 'monthly' },
  'https://localpdf.online/compare':        { priority: 0.7, changefreq: 'monthly' },
  'https://localpdf.online/pricing':       { priority: 0.9,  changefreq: 'monthly' },
  'https://localpdf.online/features/ocr-pdf':      { priority: 0.9, changefreq: 'monthly' },
  'https://localpdf.online/features/edit-pdf':     { priority: 0.9, changefreq: 'monthly' },
  'https://localpdf.online/features/compress-pdf': { priority: 0.8, changefreq: 'monthly' },
  'https://localpdf.online/features/merge-pdf':    { priority: 0.8, changefreq: 'monthly' },
  'https://localpdf.online/features/split-pdf':    { priority: 0.7, changefreq: 'monthly' },
  'https://localpdf.online/features/convert-pdf':  { priority: 0.7, changefreq: 'monthly' },
  'https://localpdf.online/features/sign-pdf':     { priority: 0.7, changefreq: 'monthly' },
  'https://localpdf.online/features/protect-pdf':  { priority: 0.7, changefreq: 'monthly' },
  'https://localpdf.online/security':      { priority: 0.8,  changefreq: 'monthly' },
  'https://localpdf.online/faq':           { priority: 0.7,  changefreq: 'monthly' },
  'https://localpdf.online/private-pdf-editor':    { priority: 0.7, changefreq: 'monthly' },
};

const sitemapAllowList = new Set([
  'https://localpdf.online',
  'https://localpdf.online/',
  'https://localpdf.online/ja',
  'https://localpdf.online/zh',
  'https://localpdf.online/about',
  'https://localpdf.online/privacy',
  'https://localpdf.online/terms',
  'https://localpdf.online/faq',
  'https://localpdf.online/security',
  'https://localpdf.online/features',
  'https://localpdf.online/features/edit-pdf',
  'https://localpdf.online/features/merge-pdf',
  'https://localpdf.online/features/ocr-pdf',
  'https://localpdf.online/features/compress-pdf',
  'https://localpdf.online/features/split-pdf',
  'https://localpdf.online/features/sign-pdf',
  'https://localpdf.online/features/convert-pdf',
  'https://localpdf.online/compare',
  'https://localpdf.online/features/auto-toc-pdf',
  'https://localpdf.online/features/protect-pdf',
  'https://localpdf.online/pricing',
  'https://localpdf.online/private-pdf-editor',
  'https://localpdf.online/pdf-tools-without-upload',
  'https://localpdf.online/refund-policy',
  'https://localpdf.online/how-local-pdf-processing-works',
  'https://localpdf.online/localpdf',
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
          page.includes('/compare/') ||
          page.includes('/use-cases/')
        ),
      customPages: [],
      serialize: (item) => {
        const meta = sitemapPriority[item.url];
        const videos = demoVideosByUrl.get(item.url);
        return {
          ...item,
          lastmod: TODAY,
          ...(meta || { priority: 0.6, changefreq: 'monthly' }),
          ...(videos
            ? {
                video: videos.map((video) => ({
                  thumbnail_loc: new URL(video.poster, SITE_ORIGIN).href,
                  title: clampTitle(video.title),
                  description: video.description,
                  content_loc: new URL(video.src, SITE_ORIGIN).href,
                })),
              }
            : {}),
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
      },
      proxy: {
        '/app': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        }
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
