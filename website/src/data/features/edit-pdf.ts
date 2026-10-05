import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/edit-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const edit_pdf: FeaturePageData = {
    slug: 'edit-pdf',
    title: 'Edit PDF Locally — Change Text Without Uploading',
    metaTitle: 'Edit PDF Locally — Change Text Without Upload | LocalPDF',
    metaDescription: 'Edit PDF text and images locally — no upload needed. Fix typos, add notes, cover sensitive sections — all in your browser. No account, works offline.',
    intro: 'Use LocalPDF when you need to change a PDF directly without sending a sensitive file through an upload-first editor.',
    demoVideos: [
      {
        src: '/demo/localpdf-highlight-pdf-text.mp4',
        poster: '/demo/localpdf-highlight-pdf-text-poster.webp',
        alt: 'Highlighting two lines of a contract with the highlighter tool in the LocalPDF canvas editor',
        caption: 'Highlighting a clause with the highlighter. Recorded from the running app.',
      },
      {
        src: '/demo/localpdf-add-text-to-pdf.mp4',
        poster: '/demo/localpdf-add-text-to-pdf-poster.webp',
        alt: 'Typing a text box onto the signature area of a PDF page in the LocalPDF canvas editor',
        caption: 'Adding a text box to the page. Recorded from the running app.',
      },
    ],
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['edit-pdf'],
    eyebrow: 'Edit PDF',
    capabilities: [
      'Replace or cover existing text in a PDF',
      'Add labels, notes, and lightweight overlays',
      'Work on sensitive documents without pushing files to a remote editor',
    ],
    whyLocal: [
      'Contracts, invoices, and internal PDFs are usually better kept out of cloud editors. When the work happens in the browser, the document is never uploaded to a remote editor.',
      'Starting locally removes the upload wait entirely and narrows exposure for sensitive files.',
      'The workflow feels closer to an app than a disposable browser utility, executing edits in < 50ms via WebAssembly.',
    ],
    howItWorks: [
      'Open the editor from LocalPDF.',
      'Select the PDF from your device.',
      'Adjust text or overlays, preview the result, then export the updated file.',
    ],
    useCases: [
      'Fix a typo in a signed internal document copy',
      'Cover sensitive fields before sharing a PDF externally',
      'Add internal review notes to a draft document',
    ],
    proofTitle: 'Edit sensitive PDFs with more control',
    proofBody: 'When a document contains names, addresses, pricing, or legal text, local editing is easier to justify and easier to trust than an upload-first editor.',
    objectionTitle: 'Why users choose local editing',
    objectionBody: 'People want a direct way to change the PDF itself without sending the file through extra tools or an upload-first handoff.',
    ctaNote: 'Open the editor when the job is to change the PDF itself, not to re-route the document into another stack.',
    quickAnswers: [
      {
        question: 'Can I edit a PDF without uploading it to a server?',
        answer: 'Yes. LocalPDF runs entirely in your browser. You open a PDF from your device, make changes, and download the result — no file ever leaves your computer.',
      },
      {
        question: 'What kinds of edits can I make?',
        answer: 'You can replace or cover existing text, add labels and notes, draw annotations, and adjust overlays directly on the PDF page.',
      },
      {
        question: 'Is my document kept private during editing?',
        answer: 'Yes. All processing happens locally in your browser via WebAssembly. Your file is never uploaded, stored, or transmitted to any server.',
      },
    ],
    intentSection: {
      title: 'Common editing jobs',
      intro: 'Most people arrive here with one of these jobs: adding visible content to a page, revising something sensitive, or rearranging pages before the file goes out.',
      items: [
        {
          title: 'Add text or lightweight overlays',
          body: 'Use the editing workflow when the job is adding labels, notes, or simple visible changes to the PDF itself.',
        },
        {
          title: 'Cover or revise sensitive sections',
          body: 'Local editing is a better fit when names, pricing, addresses, or internal notes need to be changed before sharing.',
        },
        {
          title: 'Rotate, watermark, and organize pages',
          body: 'Rotating a page, stamping a draft watermark, or reordering pages all happen on the same canvas, so you can prepare a document for handoff without switching to another tool.',
        },
      ],
    },
    blogLinks: [
      { href: '/security', title: 'Security & privacy model' },
      { href: '/use-cases/lawyers', title: 'PDF workflows for lawyers' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use Edit PDF for quick changes, cover-ups, and lightweight fixes. Editing is free on every plan; the free tier includes 3 downloads per day and 3 Studio workspaces. Pro removes those limits for recurring document work.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Edit PDF',
    },
  };
