import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/convert-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const convert_pdf: FeaturePageData = {
    slug: 'convert-pdf',
    title: 'Convert to PDF — Word, Excel, and images, without an upload',
    metaTitle: 'Free PDF Converter — Word, Excel & Images | LocalPDF',
    metaDescription: 'Convert Word and Excel files to PDF, and pull pages or images out of a PDF, in your browser — no upload required. Everything runs on your device.',
    intro: 'Use Convert PDF when you need a Word or Excel file turned into a PDF, or a PDF turned into images, without uploading anything.',
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['convert-pdf'],
    eyebrow: 'Convert PDF',
    capabilities: [
      'Turn Word and Excel documents into PDF in the browser',
      'Save PDF pages as JPG, or pull the original images out of a file',
      'Assemble images into a PDF inside the Studio canvas',
    ],
    whyLocal: [
      'Conversion is often part of a larger document workflow, not a one-off task.',
      'Users commonly need to move between PDF, Word, and image formats without re-evaluating a new tool each time.',
      'A clear conversion entry point helps users choose the right next step faster.',
      'The product should feel like one workspace, not a maze of separate tools.',
    ],
    howItWorks: [
      'Open Convert PDF.',
      'Drop in a Word or Excel file, or open a PDF from the canvas.',
      'Pick the output you need and export it from the same window.',
    ],
    useCases: [
      'Turn a Word contract into a PDF before sending it',
      'Print an Excel sheet to PDF for a clean, fixed layout',
      'Save PDF pages as JPG for slides or a web page',
    ],
    proofTitle: 'Choose the right format and keep moving',
    proofBody: 'Conversion works best when users can pick the right path quickly and continue the broader document workflow without starting over.',
    objectionTitle: 'Why users open Convert PDF',
    objectionBody: 'Users want one clear place to start when the next step depends on changing the document format.',
    ctaNote: 'Open Convert PDF when the workflow is about moving between document formats without leaving the main LocalPDF product path.',
    quickAnswers: [
      {
        question: 'Can I convert a file to PDF without uploading it?',
        answer: 'Yes. Word and Excel documents are turned into PDF in your browser, and PDF pages are saved as images there too. Nothing is uploaded for the conversion.',
      },
      {
        question: 'What conversions does LocalPDF support?',
        answer: 'Word to PDF, Excel to PDF, PDF pages to JPG, and extraction of the original images from a PDF. Images can also be collected into a PDF in the Studio canvas.',
      },
      {
        question: 'Does LocalPDF convert PDF back to Word?',
        answer: 'No. PDF to Word needs a layout engine we do not run in the browser, so the site does not offer it. OCR can pull the text out of a PDF and save it as .txt or a searchable PDF.',
      },
    ],
    intentSection: {
      title: 'Conversion paths',
      intro: 'Conversion starts with one question: which format does the next step need? These are the paths people use most.',
      items: [
        {
          title: 'Word or Excel into PDF',
          body: 'Use this workflow when a document is finished in an office format and has to go out as a PDF that looks the same on every machine.',
        },
        {
          title: 'PDF into images',
          body: 'Save one page or the whole file as JPG, or pull the original photos and scans out of a PDF without re-rendering the page.',
        },
        {
          title: 'Images into one PDF',
          body: 'Drop scans or photos into the Studio canvas, put them in order, and export a single document. Photos can also be dropped straight into a page.',
        },
      ],
    },
    blogLinks: [
      { href: '/features/compress-pdf', title: 'Compress PDF locally' },
      { href: '/security', title: 'Security & privacy model' },
    ],
  };
