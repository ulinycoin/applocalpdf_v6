export interface FeaturePageData {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  socialImage?: string;
  intro: string;
  appHash: string;
  eyebrow: string;
  capabilities: string[];
  whyLocal: string[];
  howItWorks: string[];
  useCases: string[];
  proofTitle: string;
  proofBody: string;
  objectionTitle: string;
  objectionBody: string;
  ctaNote: string;
  quickAnswers: Array<{
    question: string;
    answer: string;
  }>;
  intentSection?: {
    title: string;
    intro: string;
    items: Array<{
      title: string;
      body: string;
    }>;
  };
  blogLinks?: Array<{
    href: string;
    title: string;
  }>;
  monetizationBlock?: {
    eyebrow?: string;
    title: string;
    body: string;
    primaryCtaLabel?: string;
    secondaryCtaLabel?: string;
  };
}

export const featurePages: FeaturePageData[] = [
  {
    slug: 'edit-pdf',
    title: 'Edit PDF Locally — Change Text Without Uploading',
    metaTitle: 'Edit PDF Locally — Change Text Without Upload | LocalPDF',
    metaDescription: 'Edit PDF text and images locally — no upload needed. Fix typos, add notes, cover sensitive sections — all in your browser. No account, works offline.',
    intro: 'Use LocalPDF when you need to change a PDF directly without sending a sensitive file through an upload-first editor.',
    appHash: 'studio',
    eyebrow: 'Edit PDF',
    capabilities: [
      'Replace or cover existing text in a PDF',
      'Add labels, notes, and lightweight overlays',
      'Work on sensitive documents without pushing files to a remote editor',
    ],
    whyLocal: [
      'Contracts, invoices, and internal PDFs often are better kept out of cloud editors. Local handling guarantees 0 bytes uploaded to remote servers.',
      'Starting locally removes 100% of upload delay and narrows exposure for sensitive files.',
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
      title: 'Common edit PDF jobs this page covers',
      intro: 'This page is meant to satisfy the broader edit cluster, including common tasks that are often split into separate utility routes.',
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
          title: 'Handle rotate, watermark, and organize-style tasks',
          body: 'If the real need is adjusting pages or preparing a document for handoff, this route acts as the main entry point instead of scattering users across lookalike edit pages.',
        },
      ],
    },
    blogLinks: [
      { href: '/blog/how-to-sign-pdf-digitally', title: 'How to Sign PDF Documents Digitally' },
      { href: '/blog/pdf-security-best-practices', title: 'PDF Security Best Practices' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use Edit PDF for quick changes, cover-ups, and lightweight fixes. Upgrade when editing becomes recurring document work and you need broader Studio access without running into limits.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Edit PDF',
    },
  },
  {
    slug: 'merge-pdf',
    title: 'Merge PDF Files Locally — Drag, Drop, and Combine Instantly',
    metaTitle: 'Merge PDF Files Locally — Combine Documents Securely | LocalPDF',
    metaDescription: 'Merge PDF files locally with drag and drop. Combine documents in your browser — no upload, works offline. Reorder pages visually and export one clean PDF instantly.',
    intro: 'Merge should feel visual. Grab pages, drag them into place, reorder the packet, and export one clean PDF without fighting menus or waiting on upload loops.',
    appHash: 'studio',
    eyebrow: 'Merge PDF',
    capabilities: [
      'Merge PDFs by dragging pages into one output',
      'Move pages between documents and reorder visually',
      'Keep page movement inside one LocalPDF workspace',
    ],
    whyLocal: [
      'Drag-and-drop packet building is faster when the files start on your device. Local workflow removes an average of 45 seconds of upload/download wait time per document.',
      'Teams often merge contracts, invoices, scans, and appendices that are sensitive by default (100% data residency maintained locally).',
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
      title: 'Merge PDF intents covered here',
      intro: 'This page is the canonical destination for merge-style searches, especially when the user wants to rebuild a packet visually by dragging pages into place.',
      items: [
        {
          title: 'Combine PDF files into one handoff-ready document',
          body: 'Use this workflow when the real need is to bundle reports, contracts, appendices, scans, or attachments into one clean output without breaking the document order.',
        },
        {
          title: 'Move pages between documents with drag and drop',
          body: 'This route also covers object-movement style merge jobs where the user wants to pull pages from different PDFs, drop them into a new packet, and see the structure immediately.',
        },
        {
          title: 'Prepare merged packets for sharing, review, or archive',
          body: 'Open Merge PDF when the goal is one dependable output for delivery, filing, or internal review instead of juggling several loosely related files.',
        },
      ],
    },
    blogLinks: [
      { href: '/blog/how-to-merge-pdfs-locally-for-legal-and-finance-teams', title: 'How to Merge PDFs Locally for Legal and Finance Teams' },
      { href: '/blog/pdf-security-best-practices', title: 'PDF Security Best Practices' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use Merge PDF for fast one-off packet assembly. Upgrade when merge becomes part of a recurring workflow with bigger files, more pages, and broader PDF work across Studio.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Merge PDF',
    },
  },
  {
    slug: 'ocr-pdf',
    title: 'OCR PDF Locally — Extract Text from Scans Without Upload',
    metaTitle: 'OCR PDF Locally — Extract Text from Scans, No Upload | LocalPDF',
    metaDescription: 'Extract text from scanned PDFs locally — no upload, no server. Free OCR runs in your browser via WebAssembly. Make scans searchable in seconds, works offline.',
    intro: 'OCR is a trust-heavy workflow because scanned PDFs often contain legal, medical, or financial information. LocalPDF makes it private and fast.',
    appHash: 'studio',
    eyebrow: 'OCR PDF',
    capabilities: [
      'Extract text from scanned PDFs',
      'Produce searchable document output',
      'Keep OCR work close to the original file source',
    ],
    whyLocal: [
      'Scanned records are often the documents users least want to upload. A 0-byte upload policy keeps them entirely private.',
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
      title: 'OCR PDF intents covered here',
      intro: 'This page is the main destination for OCR-style searches, including extract-text and searchable-scan intents that are often split into separate utility routes elsewhere.',
      items: [
        {
          title: 'Turn scanned PDFs into searchable documents',
          body: 'Use this workflow when a scan, photographed document, or image-based PDF needs a text layer so users can search, copy, and reuse the contents.',
        },
        {
          title: 'Extract text from image-based PDFs for editing or reuse',
          body: 'This route also fits OCR jobs where the real need is to move text out of a scan and into the next document workflow without manually retyping it.',
        },
        {
          title: 'Prepare sensitive scans for review, archive, or accessibility',
          body: 'Open OCR PDF when the job is making archive files, records, contracts, or forms more usable before later review, search, or compliance work.',
        },
      ],
    },
    blogLinks: [
      { href: '/blog/pdf-security-best-practices', title: 'PDF Security Best Practices' },
      { href: '/blog/compress-pdf-without-losing-quality', title: 'How to Compress PDF Without Losing Quality' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use OCR PDF when you need to unlock one scan fast. Upgrade when OCR becomes part of recurring document handling, larger files, and broader PDF workflows inside Studio.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open OCR PDF',
    },
  },
  {
    slug: 'compress-pdf',
    title: 'Compress PDF Locally — Reduce File Size Without Upload',
    metaTitle: 'Compress PDF Locally — Reduce File Size, No Upload | LocalPDF',
    metaDescription: 'Compress PDF locally in your browser — reduce file size by up to 75% without uploading. No server, works offline. Perfect for email attachments and sensitive documents.',
    intro: 'Compression is a practical workflow. It should be fast, predictable, and not require an upload loop before you can send a file.',
    appHash: 'studio',
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
      title: 'Compress PDF intents covered here',
      intro: 'This page is the canonical destination for PDF compression and file-size reduction searches, especially when the user is trying to make the next handoff succeed.',
      items: [
        {
          title: 'Reduce PDF size for email and upload limits',
          body: 'Use this workflow when a PDF is finished but too large for email, customer portals, procurement systems, or other strict upload steps.',
        },
        {
          title: 'Optimize bulky scans and image-heavy PDFs',
          body: 'This route also fits files that became too heavy because of scans, embedded images, or archive exports and now need a smaller working copy.',
        },
        {
          title: 'Prepare smaller PDFs for sharing or storage',
          body: 'Open Compress PDF when the outcome is operational: faster sending, easier uploading, or cleaner long-term storage without broad claims about impossible reductions.',
        },
      ],
    },
    blogLinks: [
      { href: '/blog/compress-pdf-without-losing-quality', title: 'How to Compress PDF Files Without Losing Quality' },
      { href: '/blog/pdf-security-best-practices', title: 'PDF Security Best Practices' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use Compress PDF for quick size reduction before a send, upload, or archive step. Upgrade when compression becomes recurring work across larger documents and the rest of your PDF stack.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Compress PDF',
    },
  },
  {
    slug: 'split-pdf',
    title: 'Split PDF — Extract pages you need locally',
    metaTitle: 'Free PDF Splitter — Extract Pages Online | LocalPDF',
    metaDescription: 'Split PDF files and extract pages locally. No upload required — grab the pages you need, reorder visually, and export separate files in seconds.',
    intro: 'Use Split PDF when one document needs to become several smaller outputs and the easiest path is visual: grab the pages you need, pull them out, and export only what should leave the file.',
    appHash: 'studio',
    eyebrow: 'Split PDF',
    capabilities: [
      'Pull pages out of a PDF into smaller outputs',
      'Extract sections for sharing or filing with visual control',
      'Keep page-level document work inside the LocalPDF app',
    ],
    whyLocal: [
      'Users often split documents specifically to share less, not more. Splitting locally ensures 100% data privacy.',
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
      title: 'Split PDF intents covered here',
      intro: 'This page is meant to satisfy the common split cluster, especially when the user wants to extract pages visually and create smaller outputs without friction.',
      items: [
        {
          title: 'Split PDF by page ranges',
          body: 'Use this workflow when a long PDF needs to be broken into sections, chapters, packets, or handoff-ready ranges without leaving the main app flow.',
        },
        {
          title: 'Extract pages from a PDF for sharing',
          body: 'This route also fits selective page extraction when the real need is to pull out only the relevant pages and keep the rest of the file private.',
        },
        {
          title: 'Create smaller PDFs for review, filing, or upload',
          body: 'Open Split PDF when the goal is operational control: cleaner review files, easier filing, or smaller outputs for the next step.',
        },
      ],
    },
    blogLinks: [
      { href: '/blog/how-to-split-pdf-files', title: 'How to Split PDF Files' },
      { href: '/blog/pdf-privacy-checklist-before-sharing-contracts-or-invoices', title: 'PDF Privacy Checklist Before Sharing Contracts or Invoices' },
    ],
  },
  {
    slug: 'sign-pdf',
    title: 'Sign PDF — Add signatures locally without printing',
    metaTitle: 'Free PDF Signer — Sign Documents Online | LocalPDF',
    metaDescription: 'Sign PDF documents locally. Add signatures without printing or scanning — your files never leave your browser. Quick approvals in seconds.',
    intro: 'Signing is a trust-sensitive workflow because signatures are personal, reusable, and easy to mishandle in weak tools.',
    appHash: 'studio',
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
      title: 'Sign PDF intents covered here',
      intro: 'This page is the main destination for simple sign-PDF searches, including lightweight approval and electronic-signature jobs that do not require legal overclaiming.',
      items: [
        {
          title: 'Add a signature to a PDF for approval workflows',
          body: 'Use this workflow when the job is signing a form, contract, or internal document quickly so the file can move to the next approval step.',
        },
        {
          title: 'Handle electronic signature placement without extra tool switching',
          body: 'This route also covers e-sign style intent where the practical need is placing a signature in the PDF itself and exporting a completed version.',
        },
        {
          title: 'Complete routine signing jobs with a direct local flow',
          body: 'Open Sign PDF when the document is already prepared and the remaining task is a straightforward signature step before sending or archiving it.',
        },
      ],
    },
    blogLinks: [
      { href: '/blog/how-to-sign-pdf-digitally', title: 'How to Sign PDF Documents Digitally' },
      { href: '/blog/pdf-security-best-practices', title: 'PDF Security Best Practices' },
    ],
  },
  {
    slug: 'convert-pdf',
    title: 'Convert PDF — Word, images, and format conversions',
    metaTitle: 'Free PDF Converter — Word, Images & More | LocalPDF',
    metaDescription: 'Convert PDF to Word, Word to PDF, and PDF to images locally. Free format conversion runs in your browser — no upload required.',
    intro: 'Use Convert PDF when you need PDF to Word, Word to PDF, PDF to image, or image to PDF conversion without leaving the main workflow.',
    appHash: 'studio',
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
        answer: 'Yes. LocalPDF converts PDF to Word format entirely in your browser. Your document never leaves your device during the conversion.',
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
      title: 'Conversion paths covered here',
      intro: 'This feature page is the main destination for the most common long-tail conversion intents routed into LocalPDF.',
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
          title: 'One conversion entry point instead of many thin pages',
          body: 'The goal is to help users pick the right format path quickly, including common convert PDF searches that would otherwise fragment into separate thin pages.',
        },
      ],
    },
    blogLinks: [
      { href: '/blog/convert-pdf-to-images-guide', title: 'How to Convert PDF to Images' },
      { href: '/blog/pdf-security-best-practices', title: 'PDF Security Best Practices' },
    ],
  },
  {
    slug: 'auto-toc-pdf',
    title: 'Auto-TOC — Generate PDF table of contents locally',
    metaTitle: 'Free PDF Table of Contents Generator | LocalPDF',
    metaDescription: 'Auto-generate PDF table of contents and bookmarks. Detect headings locally — no upload required. Create clickable TOC pages in seconds.',
    intro: 'Auto-TOC is a high-utility tool when working with large PDFs, manuals, reports, and books. It generates structured outlines and a physical TOC page without uploading files.',
    appHash: 'studio',
    eyebrow: 'Auto-TOC',
    capabilities: [
      'Detect headings and levels automatically',
      'Generate interactive PDF bookmarks (outlines)',
      'Create a physical Table of Contents page with clickable links',
    ],
    whyLocal: [
      'Long documents like books, financial reports, or legal filings are highly sensitive. A 0-byte upload policy guarantees complete confidentiality.',
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
    proofTitle: 'Structure complex PDFs with zero remote exposure',
    proofBody: 'Reports, briefs, and manuals need structured navigation to be useful. Adding bookmarks and a clickable TOC page locally ensures document integrity and absolute privacy.',
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
      title: 'TOC & Bookmark intents covered here',
      intro: 'This page serves as the main destination for users looking to organize PDF navigation, create clickable directories, or build outline levels.',
      items: [
        {
          title: 'Generate PDF bookmarks (outlines) for navigation',
          body: 'Use this tool when you want to build a hierarchical navigation sidebar so users can jump to any section of your PDF in one click.',
        },
        {
          title: 'Insert a physical Table of Contents page',
          body: 'This route also covers cases where a formal document needs a visual, clickable index page generated at the start of the file.',
        },
        {
          title: 'Organize large, multi-page PDFs for review',
          body: 'Open Auto-TOC when preparing binders, books, long reports, or scanned catalogs that need structured layout navigation.',
        },
      ],
    },
    blogLinks: [
      { href: '/blog/how-to-generate-pdf-table-of-contents', title: 'How to Generate a PDF Table of Contents' },
      { href: '/blog/pdf-security-best-practices', title: 'PDF Security Best Practices' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Free for quick tasks. Pro for recurring PDF work.',
      body: 'Use Auto-TOC to organize documents up to 5 pages for free. Upgrade when working with larger books, reports, or legal bundles to access unlimited TOC parsing across Studio.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Auto-TOC',
    },
  },
];

export function getFeaturePage(slug: string) {
  return featurePages.find((page) => page.slug === slug);
}
