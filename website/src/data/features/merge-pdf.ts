import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/merge-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const merge_pdf: FeaturePageData = {
    slug: 'merge-pdf',
    title: 'Merge PDF Files Locally — Drag, Drop, and Combine Instantly',
    metaTitle: 'Merge PDF Files Locally — No Upload Needed | LocalPDF',
    metaDescription: 'Merge PDF files locally with drag and drop. Combine in your browser — no upload, works offline. Reorder pages and export one clean PDF.',
    intro: 'Merge should feel visual. Grab pages, drag them into place, reorder the packet, and export one clean PDF without fighting menus or waiting on upload loops.',
    demoVideos: [
      {
        src: '/demo/localpdf-merge-pdf-pages.mp4',
        poster: '/demo/localpdf-merge-pdf-pages-poster.webp',
        alt: 'Selecting two pages in one PDF workspace and merging them into a second workspace in the LocalPDF canvas',
        caption: 'Select pages, click Merge, pick the workspace. Recorded from the running app.',
        title: 'Merge two PDFs by dragging pages into a third workspace',
        description: 'Selected pages moved out of two open PDFs and rebuilt into a new document on the canvas. Recorded from the running app.',
        transcript: 'workspace-a.pdf and workspace-b.pdf are open on the LocalPDF canvas. Pages are selected in the first workspace, the badge shows two selected, and the Merge action is chosen from the tool rail. The selected pages are moved across and workspace-c.pdf is created to receive them. By the end of the clip the new document holds the pages pulled from both sources, in the order they were added. The packet is assembled in the browser from files already on the device.',
      },
    ],
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['merge-pdf'],
    eyebrow: 'Merge PDF',
    capabilities: [
      'Merge PDFs by dragging pages into one output',
      'Move pages between documents and reorder visually',
      'Keep page movement inside one LocalPDF workspace',
    ],
    whyLocal: [
      'Drag-and-drop packet building is faster when the files start on your device. Local workflow removes an average of 45 seconds of upload/download wait time per document.',
      'Teams often merge contracts, invoices, scans, and appendices that are sensitive by default. The merged packet is assembled on your device and never uploaded to assemble it.',
      'A local-first merge flow feels more direct, more tactile, and easier to trust.',
    ],
    howItWorks: [
      'Open Merge PDF.',
      'Load the source files from your device.',
      'Drag pages into the order you want, then export the merged PDF.',
    ],
    useCases: [
      'Drag contract appendices into one final packet',
      'Pull pages from different PDFs into a client handoff file',
      'Merge scan batches by moving pages visually instead of rebuilding them manually',
    ],
    proofTitle: 'Move pages between PDFs like it should always have worked',
    proofBody: 'This flow wins because it is visual and immediate: grab a page, move it, drop it into place, and finish the packet without extra waiting.',
    objectionTitle: 'Why users choose LocalPDF for merge',
    objectionBody: 'People do not want merge to feel like form-filling. They want to move pages with drag and drop and see the result take shape instantly.',
    ctaNote: 'Open Merge PDF when the task is to pull pages together, reorder them visually, and export one clean document in seconds.',
    quickAnswers: [
      {
        question: 'How do I merge multiple PDF files?',
        answer: 'Open Merge PDF, load your files from your device, then drag pages from different documents into one pile. Export the result when the order looks right.',
      },
      {
        question: 'Can I reorder pages while merging?',
        answer: 'Yes. Once pages from multiple PDFs are loaded, you can drag them into any order before exporting the final merged document.',
      },
      {
        question: 'Do the original files get uploaded anywhere?',
        answer: 'No. Everything stays in your browser. Files are loaded from your device and merged locally — nothing is sent to a server.',
      },
    ],
    intentSection: {
      title: 'Merge jobs',
      intro: 'Merging is the job of rebuilding a packet: pull pages from several files, put them in the order you want, and export one PDF.',
      items: [
        {
          title: 'Combine PDF files into one handoff-ready document',
          body: 'Use this workflow when the job is to bundle reports, contracts, appendices, scans, or attachments into one clean output without breaking the document order.',
        },
        {
          title: 'Move pages between documents with drag and drop',
          body: 'Pull pages from different PDFs, drop them into a new packet, and see the structure take shape immediately instead of rebuilding the file by hand.',
        },
        {
          title: 'Prepare merged packets for sharing, review, or archive',
          body: 'Open Merge PDF when the goal is one dependable output for delivery, filing, or internal review instead of juggling several loosely related files.',
        },
      ],
    },
    blogLinks: [
      { href: '/use-cases/lawyers', title: 'PDF workflows for lawyers' },
      { href: '/use-cases/accountants', title: 'PDF workflows for accountants' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use Merge PDF for fast one-off packet assembly. Merging is free on every plan; the free tier includes 3 downloads per day and 3 Studio workspaces. Pro removes those limits when merging becomes a recurring workflow.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Merge PDF',
    },
  };
