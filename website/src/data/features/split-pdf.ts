import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/split-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const split_pdf: FeaturePageData = {
    slug: 'split-pdf',
    title: 'Split PDF — Extract pages you need locally',
    metaTitle: 'Free PDF Splitter — Extract Pages Online | LocalPDF',
    metaDescription: 'Split PDF files and extract pages locally. No upload required — grab the pages you need, reorder visually, and export separate files in seconds.',
    intro: 'Use Split PDF when one document needs to become several smaller outputs and the easiest path is visual: grab the pages you need, pull them out, and export only what should leave the file.',
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['split-pdf'],
    eyebrow: 'Split PDF',
    capabilities: [
      'Pull pages out of a PDF into smaller outputs',
      'Extract sections for sharing or filing with visual control',
      'Keep page-level document work inside the LocalPDF app',
    ],
    whyLocal: [
      'Users often split documents specifically to share less, not more. Splitting locally means the pages you remove never pass through a server on the way out.',
      'A local split flow removes network latency, extracting pages in milliseconds before any later upload.',
      'The job is operational, visual, and should feel like moving objects instead of filling out a form.',
    ],
    howItWorks: [
      'Open Split PDF.',
      'Load the source document and pull out the pages or ranges you need.',
      'Export the new files.',
    ],
    useCases: [
      'Pull a signed page out of a contract packet',
      'Drag selected pages into a smaller review file',
      'Extract only the pages needed for external sharing in one quick motion',
    ],
    proofTitle: 'Pull pages out with one movement and keep the rest private',
    proofBody: 'Splitting feels better when the workflow is visual: grab the pages that should leave the document, separate them cleanly, and export only what matters.',
    objectionTitle: 'Why users choose local splitting',
    objectionBody: 'Users often split documents to share less information, not more. They want direct control over page movement, not a clumsy page-range puzzle.',
    ctaNote: 'Open Split PDF when one large document needs to become several smaller outputs and the easiest path is to pull out the exact pages you need.',
    quickAnswers: [
      {
        question: 'How do I split a PDF into separate files?',
        answer: 'Open Split PDF, load your document, then select the pages you want to extract. Export each selection as a new separate PDF file.',
      },
      {
        question: 'Can I extract just one page from a PDF?',
        answer: 'Yes. Click on any page tile to select it, then export. You can pull out a single page or any combination of pages from a larger document.',
      },
      {
        question: 'Does splitting happen on a server?',
        answer: 'No. All splitting happens locally in your browser. Your document is never uploaded anywhere — you control which pages leave the file.',
      },
    ],
    intentSection: {
      title: 'Split jobs',
      intro: 'Splitting is about sending less: pull out the pages that need to leave the document and export them as their own files.',
      items: [
        {
          title: 'Split PDF by page ranges',
          body: 'Use this workflow when a long PDF needs to be broken into sections, chapters, packets, or handoff-ready ranges without leaving the main app flow.',
        },
        {
          title: 'Extract pages from a PDF for sharing',
          body: 'Selective extraction is the common case: pull out only the pages the recipient needs and leave everything else in the original file.',
        },
        {
          title: 'Create smaller PDFs for review, filing, or upload',
          body: 'Open Split PDF when the goal is operational control: cleaner review files, easier filing, or smaller outputs for the next step.',
        },
      ],
    },
    blogLinks: [
      { href: '/features/merge-pdf', title: 'Merge PDF locally' },
      { href: '/security', title: 'Security & privacy model' },
    ],
  };
