import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/convert-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const convert_pdf: FeaturePageData = {
    slug: 'convert-pdf',
    title: 'Convert PDF — Word, images, and format conversions',
    metaTitle: 'Free PDF Converter — Word, Images & More | LocalPDF',
    metaDescription: 'Convert PDF to Word, Word to PDF, and PDF to images locally. Free format conversion runs in your browser — no upload required.',
    intro: 'Use Convert PDF when you need PDF to Word, Word to PDF, PDF to image, or image to PDF conversion without leaving the main workflow.',
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['convert-pdf'],
    eyebrow: 'Convert PDF',
    capabilities: [
      'Handle common PDF, Word, and image conversion workflows in one place',
      'Move between formats without leaving the product workflow',
      'Start conversion from one clear entry point inside the app',
    ],
    whyLocal: [
      'Conversion is often part of a larger document workflow, not a one-off task.',
      'Users commonly need to move between PDF, Word, and image formats without re-evaluating a new tool each time.',
      'A clear conversion entry point helps users choose the right next step faster.',
      'The product should feel like one workspace, not a maze of separate tools.',
    ],
    howItWorks: [
      'Open Convert PDF.',
      'Choose the source format and target output path inside the app flow.',
      'Review and export the converted result.',
    ],
    useCases: [
      'Convert a PDF to Word for editable reuse',
      'Generate a PDF from a Word document before sending or signing',
      'Move between PDF pages and image-based workflows',
    ],
    proofTitle: 'Choose the right format and keep moving',
    proofBody: 'Conversion works best when users can pick the right path quickly and continue the broader document workflow without starting over.',
    objectionTitle: 'Why users open Convert PDF',
    objectionBody: 'Users want one clear place to start when the next step depends on changing the document format.',
    ctaNote: 'Open Convert PDF when the workflow is about moving between document formats without leaving the main LocalPDF product path.',
    quickAnswers: [
      {
        question: 'Can I convert PDF to Word without uploading?',
        answer: 'Yes. LocalPDF converts PDF to Word format in your browser. The document is not uploaded for the conversion.',
      },
      {
        question: 'What file formats can I convert between?',
        answer: 'LocalPDF supports PDF to Word, Word to PDF, PDF to images (PNG/JPG), and images to PDF — all in one workspace.',
      },
      {
        question: 'Is conversion quality preserved?',
        answer: 'LocalPDF preserves the original layout and content as closely as possible. Text-based PDFs convert cleanly; image-based PDFs are handled through OCR.',
      },
    ],
    intentSection: {
      title: 'Conversion paths',
      intro: 'Conversion starts with one question: which format does the next step need? These are the paths people use most.',
      items: [
        {
          title: 'PDF to Word and Word to PDF',
          body: 'Use this workflow when the document needs to move between PDF and editable Word formats, whether the job starts with editing, review, or final export.',
        },
        {
          title: 'PDF to PNG, PDF to JPG, and image to PDF',
          body: 'This route also covers image-based conversion tasks, including exporting PDF pages as images or combining images into a PDF for sharing and archive work.',
        },
        {
          title: 'Both directions stay in one workspace',
          body: 'PDF to Word, Word to PDF, PDF to images, images to PDF — pick the format you need and keep working in the same window instead of starting over elsewhere.',
        },
      ],
    },
    blogLinks: [
      { href: '/features/compress-pdf', title: 'Compress PDF locally' },
      { href: '/security', title: 'Security & privacy model' },
    ],
  };
