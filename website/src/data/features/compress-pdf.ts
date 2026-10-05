import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/compress-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const compress_pdf: FeaturePageData = {
    slug: 'compress-pdf',
    title: 'Compress PDF Locally — Reduce File Size Without Upload',
    metaTitle: 'Compress PDF Locally — Reduce Size, No Upload | LocalPDF',
    metaDescription: 'Compress PDF locally — reduce file size by up to 75% without uploading. No server, works offline. Ideal for email and sensitive docs.',
    intro: 'Compression is a practical workflow. It should be fast, predictable, and not require an upload loop before you can send a file.',
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['compress-pdf'],
    eyebrow: 'Compress PDF',
    capabilities: [
      'Reduce PDF size before sharing',
      'Handle bulky documents in a local workflow',
      'Prepare PDFs for email, form portals, and archives',
    ],
    whyLocal: [
      'A lot of compression jobs happen right before a user needs to send the file somewhere else.',
      'If the source document is sensitive, upload-first compression adds friction and risk.',
      'Compression is easier to trust when the product reduces file sizes by up to 75% entirely on your local device.',
    ],
    howItWorks: [
      'Open Compress PDF.',
      'Load the source document.',
      'Run compression and export the smaller version.',
    ],
    useCases: [
      'Reduce attachment size for email',
      'Prepare documents for strict upload portals',
      'Trim archive copies before storing them internally',
    ],
    proofTitle: 'Make PDFs smaller before the next handoff',
    proofBody: 'Users care about a smaller file that is easier to send, upload, or archive without adding another waiting loop.',
    objectionTitle: 'Why users open Compress PDF',
    objectionBody: 'The value is practical: reduce file size, keep the workflow moving, and prepare the document for the next step.',
    ctaNote: 'Open Compress PDF when the document is ready but still too heavy for the next step in the workflow.',
    quickAnswers: [
      {
        question: 'How much can I reduce a PDF file size?',
        answer: 'LocalPDF can reduce PDF file sizes by up to 75%, depending on the content. Image-heavy documents benefit the most from compression.',
      },
      {
        question: 'Does compression affect PDF quality?',
        answer: 'You control the DPI and JPEG quality settings. Starting at 110–150 DPI and ~80% quality gives a good balance between file size and readability.',
      },
      {
        question: 'Can I compress a PDF before emailing it?',
        answer: 'Yes. Compression is designed for exactly this — make the file smaller before sending it via email, uploading to a portal, or archiving it.',
      },
    ],
    intentSection: {
      title: 'Compression jobs',
      intro: 'Compression is usually the last step before a handoff: the document is finished, but it is too heavy to email, upload, or store as it is.',
      items: [
        {
          title: 'Reduce PDF size for email and upload limits',
          body: 'Use this workflow when a PDF is finished but too large for email, customer portals, procurement systems, or other strict upload steps.',
        },
        {
          title: 'Optimize bulky scans and image-heavy PDFs',
          body: 'Scans, embedded images, and archive exports are what usually make a PDF heavy. Compression targets those images and leaves the text layer intact.',
        },
        {
          title: 'Prepare smaller PDFs for sharing or storage',
          body: 'Open Compress PDF when the outcome is operational: faster sending, easier uploading, or cleaner long-term storage without broad claims about impossible reductions.',
        },
      ],
    },
    blogLinks: [
      { href: '/security', title: 'Security & privacy model' },
      { href: '/features/merge-pdf', title: 'Merge PDF locally' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use Compress PDF for quick size reduction before a send, upload, or archive step. Compression is free on every plan; the free tier includes 3 downloads per day and 3 Studio workspaces. Pro removes those limits for recurring work.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Compress PDF',
    },
  };
