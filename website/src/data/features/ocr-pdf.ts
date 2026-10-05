import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/ocr-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const ocr_pdf: FeaturePageData = {
    slug: 'ocr-pdf',
    title: 'OCR PDF Locally — Extract Text from Scans Without Upload',
    metaTitle: 'OCR PDF Locally — Extract Text, No Upload | LocalPDF',
    metaDescription: 'Extract text from scanned PDFs locally — no upload, no server. Free OCR runs in your browser via WebAssembly. Make scans searchable in seconds, works offline.',
    intro: 'OCR is a trust-heavy workflow because scanned PDFs often contain legal, medical, or financial information. LocalPDF makes it private and fast.',
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['ocr-pdf'],
    eyebrow: 'OCR PDF',
    capabilities: [
      'Extract text from scanned PDFs',
      'Produce searchable document output',
      'Keep OCR work close to the original file source',
    ],
    whyLocal: [
      'Scanned records are often the documents users least want to upload. OCR in the browser means the scan is never sent to a server to be read.',
      'OCR already takes time; removing the network handoff saves critical seconds per file.',
      'A local-first OCR workflow processes scans directly in the browser via WebAssembly, typically extracting text at 1-2 seconds per page.',
    ],
    howItWorks: [
      'Open OCR PDF in LocalPDF.',
      'Load a scanned PDF.',
      'Run OCR and export the searchable result.',
    ],
    useCases: [
      'Make a scanned agreement searchable',
      'Extract text from archive documents',
      'Prepare image-heavy PDFs for internal search and reuse',
    ],
    proofTitle: 'Turn scans into searchable PDFs with less exposure',
    proofBody: 'OCR is a trust-heavy workflow because scanned documents often contain sensitive information. Users need a clear path from scan to searchable output.',
    objectionTitle: 'What users are worried about',
    objectionBody: 'Scanned PDFs are often the files users most hesitate to upload. That concern needs a direct answer, without decorative language.',
    ctaNote: 'Open OCR PDF when a scanned document needs to become usable, searchable, and easier to work with.',
    quickAnswers: [
      {
        question: 'Can I run OCR on a scanned PDF without uploading it?',
        answer: 'Yes. OCR runs entirely in your browser using WebAssembly. Your scanned document is never uploaded to any server.',
      },
      {
        question: 'What languages does OCR support?',
        answer: 'LocalPDF supports OCR for English, Japanese, Chinese, Korean, German, French, Spanish, Italian, Portuguese, Arabic, Hindi, and Ukrainian.',
      },
      {
        question: 'How long does OCR take per page?',
        answer: 'OCR typically processes one page in 1–2 seconds, depending on the document complexity and your device speed.',
      },
    ],
    intentSection: {
      title: 'OCR jobs',
      intro: 'OCR fits whenever a document is an image of text: a scan, a photographed page, or an export with no text layer.',
      items: [
        {
          title: 'Turn scanned PDFs into searchable documents',
          body: 'Use this workflow when a scan, photographed document, or image-based PDF needs a text layer so users can search, copy, and reuse the contents.',
        },
        {
          title: 'Extract text from image-based PDFs for editing or reuse',
          body: 'A scan with no text layer cannot be searched, copied, or edited. OCR adds that layer so the text can move into the next document workflow without retyping.',
        },
        {
          title: 'Prepare sensitive scans for review, archive, or accessibility',
          body: 'Open OCR PDF when the job is making archive files, records, contracts, or forms more usable before later review, search, or compliance work.',
        },
      ],
    },
    blogLinks: [
      { href: '/security', title: 'Security & privacy model' },
      { href: '/features/compress-pdf', title: 'Compress PDF locally' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use OCR PDF when you need a searchable scan fast. OCR is free on every plan; the free tier includes 3 downloads per day and 3 Studio workspaces. Pro removes those limits for recurring document handling.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open OCR PDF',
    },
  };
