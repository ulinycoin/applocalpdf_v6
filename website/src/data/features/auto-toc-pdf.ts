import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/auto-toc-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const auto_toc_pdf: FeaturePageData = {
    slug: 'auto-toc-pdf',
    title: 'Auto-TOC — Generate PDF table of contents locally',
    metaTitle: 'Free PDF Table of Contents Generator | LocalPDF',
    metaDescription: 'Auto-generate PDF table of contents and bookmarks. Detect headings locally — no upload required. Create clickable TOC pages in seconds.',
    intro: 'Auto-TOC is a high-utility tool when working with large PDFs, manuals, reports, and books. It generates structured outlines and a physical TOC page without uploading files.',
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['auto-toc-pdf'],
    eyebrow: 'Auto-TOC',
    capabilities: [
      'Detect headings and levels automatically',
      'Generate interactive PDF bookmarks (outlines)',
      'Create a physical Table of Contents page with clickable links',
    ],
    whyLocal: [
      'Long documents like books, financial reports, or legal filings are highly sensitive. Running outline detection in the browser means the document is never uploaded for analysis.',
      'Parsing large multi-hundred page documents is faster when done locally, avoiding massive upload times.',
      'A local-first TOC generator parses and updates documents directly in the browser via WebWorker heuristics in just a few seconds.',
    ],
    howItWorks: [
      'Open Auto-TOC in LocalPDF.',
      'Load your PDF document.',
      'Review detected headings, adjust levels, customize the physical TOC page, and export your updated PDF.',
    ],
    useCases: [
      'Add bookmarks and a clickable TOC page to a corporate report',
      'Structure scanned books and manuals for easier navigation',
      'Prepare legal and financial binders with nested outline levels',
    ],
    proofTitle: 'Structure complex PDFs without uploading them',
    proofBody: 'Reports, briefs, and manuals need structured navigation to be useful. Generating bookmarks and a clickable TOC page within the browser keeps the document on your device while you do it.',
    objectionTitle: 'Why users choose LocalPDF for TOC',
    objectionBody: 'Large documents are the ones users are most reluctant to upload to unknown servers. Our local WebAssembly/WebWorker processing makes outline generation private and instant.',
    ctaNote: 'Open Auto-TOC to quickly structure and bookmark your documents, making them readable and professional.',
    quickAnswers: [
      {
        question: 'How does the heading detection work?',
        answer: 'The tool uses smart font-size heuristics to identify potential headings and nest them into levels (H1, H2, H3) automatically, which you can easily edit in the review panel.',
      },
      {
        question: 'Does this create physical pages or sidebar bookmarks?',
        answer: 'Both. You can generate standard PDF bookmarks (accessible in any PDF viewer sidebar) and/or insert a physical Table of Contents page at the beginning of the file.',
      },
      {
        question: 'What languages are supported?',
        answer: 'All major languages, including Baltic, Cyrillic, and Latin alphabets, are supported with embedded font styling for the physical TOC page.',
      },
    ],
    intentSection: {
      title: 'Table of contents and bookmark jobs',
      intro: 'These jobs are about navigation: making a long PDF jump to the right section instead of scrolling through hundreds of pages.',
      items: [
        {
          title: 'Generate PDF bookmarks (outlines) for navigation',
          body: 'Use this tool when you want to build a hierarchical navigation sidebar so users can jump to any section of your PDF in one click.',
        },
        {
          title: 'Insert a physical Table of Contents page',
          body: 'Some documents need a visible index page rather than a sidebar entry. Auto-TOC can generate that page, with links to each section, at the start of the file.',
        },
        {
          title: 'Organize large, multi-page PDFs for review',
          body: 'Open Auto-TOC when preparing binders, books, long reports, or scanned catalogs that need structured layout navigation.',
        },
      ],
    },
    blogLinks: [
      { href: '/features/edit-pdf', title: 'Edit PDF locally' },
      { href: '/security', title: 'Security & privacy model' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use Auto-TOC on a document of any length for free. Upgrade to Pro when PDF work becomes recurring and you want unlimited downloads and Studio workspaces.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Auto-TOC',
    },
  };
