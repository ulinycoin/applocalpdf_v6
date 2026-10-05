import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/sign-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const sign_pdf: FeaturePageData = {
    slug: 'sign-pdf',
    title: 'Sign PDF — Add signatures locally without printing',
    metaTitle: 'Free PDF Signer — Sign Documents Online | LocalPDF',
    metaDescription: 'Sign PDF documents locally. Add signatures without printing or scanning — your files never leave your browser. Quick approvals in seconds.',
    intro: 'Signing is a trust-sensitive workflow because signatures are personal, reusable, and easy to mishandle in weak tools.',
    demoVideos: [
      {
        src: '/demo/localpdf-sign-pdf-signature.mp4',
        poster: '/demo/localpdf-sign-pdf-signature-poster.webp',
        alt: 'Drawing a signature with the mouse and inserting it onto a PDF page in the LocalPDF canvas editor',
        caption: 'Drawing a signature, then inserting it onto the page. Recorded from the running app.',
      },
    ],
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['sign-pdf'],
    eyebrow: 'Sign PDF',
    capabilities: [
      'Place a signature into a PDF workflow',
      'Handle quick approvals without bouncing between tools',
      'Keep signature placement inside the LocalPDF app',
    ],
    whyLocal: [
      'Users are cautious with signatures even when the document itself is routine.',
      'A local flow is easier to explain than a service that asks for upload first.',
      'Signing should be fast, narrow, and under user control.',
    ],
    howItWorks: [
      'Open Sign PDF.',
      'Choose the source file and place the signature.',
      'Export the signed version.',
    ],
    useCases: [
      'Sign a vendor form quickly',
      'Approve a simple internal document',
      'Complete a PDF workflow without printing and rescanning',
    ],
    proofTitle: 'Sign PDFs with a shorter path to approval',
    proofBody: 'Signing works best when the workflow stays simple: open the document, place the signature, and export the result without bouncing between tools.',
    objectionTitle: 'Why users choose LocalPDF for signing',
    objectionBody: 'The value is a simple signing flow that stays close to the document and removes unnecessary steps between review and completion.',
    ctaNote: 'Open Sign PDF when the job is quick approval, lightweight signature placement, and a shorter path from document to completion.',
    quickAnswers: [
      {
        question: 'Can I sign a PDF without printing it?',
        answer: 'Yes. Open Sign PDF, place your signature on the document, and export the signed version — no printing or scanning needed.',
      },
      {
        question: 'Is my signature data kept private?',
        answer: 'Yes. The signing process happens entirely in your browser. Your signature and document are never uploaded to any server.',
      },
      {
        question: 'What types of documents can I sign?',
        answer: 'You can sign any PDF document — contracts, forms, invoices, approval letters, and other routine documents that need a signature.',
      },
    ],
    intentSection: {
      title: 'Signing jobs',
      intro: 'Signing covers routine approvals: forms, contracts, and internal documents that need a signature before they move on.',
      items: [
        {
          title: 'Add a signature to a PDF for approval workflows',
          body: 'Use this workflow when the job is signing a form, contract, or internal document quickly so the file can move to the next approval step.',
        },
        {
          title: 'Place a signature without switching tools',
          body: 'Draw or upload a signature, drop it onto the page where it belongs, and export the completed file from the same window.',
        },
        {
          title: 'Complete routine signing jobs with a direct local flow',
          body: 'Open Sign PDF when the document is already prepared and the remaining task is a straightforward signature step before sending or archiving it.',
        },
      ],
    },
    blogLinks: [
      { href: '/security', title: 'Security & privacy model' },
      { href: '/features/edit-pdf', title: 'Edit PDF locally' },
    ],
  };
