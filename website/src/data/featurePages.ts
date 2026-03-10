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
}

export const featurePages: FeaturePageData[] = [
  {
    slug: 'edit-pdf',
    title: 'Edit PDF locally without handing the file to a cloud tool',
    metaTitle: 'Edit PDF locally | LocalPDF',
    metaDescription: 'Edit PDF text, overlays, and sensitive sections locally with LocalPDF. Keep document handling on your device.',
    socialImage: 'https://localpdf.online/og/edit-pdf.svg',
    intro: 'Use LocalPDF when you need direct PDF changes without turning a sensitive document into an upload workflow.',
    appHash: 'edit-text',
    eyebrow: 'Edit PDF',
    capabilities: [
      'Replace or cover existing text in a PDF',
      'Add labels, notes, and lightweight overlays',
      'Work on sensitive documents without pushing files to a remote editor',
    ],
    whyLocal: [
      'Contracts, invoices, and internal PDFs often should not be routed through cloud editors.',
      'Starting locally removes upload delay and narrows exposure for sensitive files.',
      'The workflow feels closer to an app than a disposable browser utility.',
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
    proofTitle: 'Editing is one of the clearest privacy workflows',
    proofBody: 'When a document contains names, addresses, pricing, or legal text, local editing is easier to justify than upload-first editing.',
    objectionTitle: 'What users need to believe before they click',
    objectionBody: 'They need to understand that LocalPDF is for direct PDF work, not for exporting them into a maze of one-off utilities or forcing them into a cloud handoff first.',
    ctaNote: 'Open the editor when the job is to change the PDF itself, not to re-route the document into another stack.',
    quickAnswers: [
      {
        question: 'When is this page the right fit?',
        answer: 'When the document already exists as a PDF and the job is to change, cover, or annotate parts of that file directly.',
      },
      {
        question: 'Why does local editing matter more here?',
        answer: 'Editing often touches names, pricing, addresses, signatures, and legal text. That is exactly where users question upload-first tools.',
      },
      {
        question: 'What should the page avoid promising?',
        answer: 'It should avoid vague “AI editor” language and focus on concrete editing jobs that users actually need to finish.',
      },
    ],
  },
  {
    slug: 'merge-pdf',
    title: 'Merge PDF files locally and keep ordering work fast',
    metaTitle: 'Merge PDF locally | LocalPDF',
    metaDescription: 'Merge PDF files locally with LocalPDF. Combine documents without upload-first processing or scattered browser tools.',
    socialImage: 'https://localpdf.online/og/merge-pdf.svg',
    intro: 'Merge is one of the highest-usage PDF jobs. It should be immediate, not gated by upload time and queueing.',
    appHash: 'merge',
    eyebrow: 'Merge PDF',
    capabilities: [
      'Combine multiple PDF files into one output',
      'Reorder before export',
      'Keep the merge flow inside the LocalPDF workspace',
    ],
    whyLocal: [
      'Large attachments waste time when every merge starts with upload and wait states.',
      'Teams often merge sensitive pages like contracts, invoices, and scans.',
      'A local merge flow is easier to trust and easier to repeat.',
    ],
    howItWorks: [
      'Open Merge PDF.',
      'Add the source files from your device.',
      'Review the order and export the merged PDF.',
    ],
    useCases: [
      'Bundle a contract with appendices',
      'Assemble a client handoff packet',
      'Merge batch scans into a single review file',
    ],
    proofTitle: 'Merge should feel like file handling, not cloud submission',
    proofBody: 'This is a core utility flow. The product should make it obvious that the operation starts from your device and stays under your control.',
    objectionTitle: 'What this page must remove',
    objectionBody: 'Users should not have to wonder whether merge is a throwaway web tool or part of a stable app workflow. The page should resolve that immediately.',
    ctaNote: 'Open Merge PDF when the task is bundling source files quickly without wasting time on upload delay and queueing.',
    quickAnswers: [
      {
        question: 'What is the actual job here?',
        answer: 'Combine several PDFs into one clean output without breaking momentum or re-uploading files into a queue-shaped web flow.',
      },
      {
        question: 'Why is merge still a trust page?',
        answer: 'Merge often involves contracts, scanned records, internal packets, or invoices. The documents may be routine, but they are rarely disposable.',
      },
      {
        question: 'What should make this page convert?',
        answer: 'It should feel immediate. The user needs to believe they can add files, set order, and export the result quickly inside one product path.',
      },
    ],
  },
  {
    slug: 'ocr-pdf',
    title: 'Run OCR on PDF documents locally for searchable text',
    metaTitle: 'OCR PDF locally | LocalPDF',
    metaDescription: 'Run OCR on PDF files locally with LocalPDF and turn scans into searchable documents without sending them away first.',
    socialImage: 'https://localpdf.online/og/ocr-pdf.svg',
    intro: 'OCR is a trust-heavy workflow because scanned PDFs often contain legal, medical, or financial information.',
    appHash: 'ocr',
    eyebrow: 'OCR PDF',
    capabilities: [
      'Extract text from scanned PDFs',
      'Produce searchable document output',
      'Keep OCR work close to the original file source',
    ],
    whyLocal: [
      'Scanned records are often the documents users least want to upload.',
      'OCR already takes time; upload overhead makes the flow worse.',
      'A local-first OCR story is easier to explain and easier for AI/search to summarize.',
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
    proofTitle: 'OCR is where privacy claims need to sound concrete',
    proofBody: 'This page should stay technical and factual. Avoid hype. Emphasize what the user can do and why the local workflow matters.',
    objectionTitle: 'What users are worried about',
    objectionBody: 'Scanned PDFs are often the files users most hesitate to upload. This page needs to answer that concern directly, without decorative language.',
    ctaNote: 'Open OCR PDF when a scanned document needs to become usable, searchable, and easier to work with.',
    quickAnswers: [
      {
        question: 'Why is OCR a high-trust workflow?',
        answer: 'Scanned contracts, records, forms, and archive files are often the last documents users want to send away before they even know the result quality.',
      },
      {
        question: 'What should the user understand fast?',
        answer: 'That OCR here is a practical step to make a scanned PDF searchable and usable, not a black-box promise wrapped in buzzwords.',
      },
      {
        question: 'What should this page emphasize?',
        answer: 'Searchable output, local workflow, and the fact that scanned documents are often sensitive by default.',
      },
    ],
  },
  {
    slug: 'compress-pdf',
    title: 'Compress PDF files locally before sending or archiving them',
    metaTitle: 'Compress PDF locally | LocalPDF',
    metaDescription: 'Compress PDF files locally with LocalPDF before sharing, uploading, or archiving large documents.',
    socialImage: 'https://localpdf.online/og/compress-pdf.svg',
    intro: 'Compression is a practical workflow. It should be fast, predictable, and not require an upload loop before you can send a file.',
    appHash: 'compress',
    eyebrow: 'Compress PDF',
    capabilities: [
      'Reduce PDF size before sharing',
      'Handle bulky documents in a local workflow',
      'Prepare PDFs for email, form portals, and archives',
    ],
    whyLocal: [
      'A lot of compression jobs happen right before a user needs to send the file somewhere else.',
      'If the source document is sensitive, upload-first compression adds friction and risk.',
      'Compression is easier to trust when the product explains its limits honestly.',
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
    proofTitle: 'Compression should be operational, not theatrical',
    proofBody: 'Users care about fit-for-purpose output. Message the result, not magic claims.',
    objectionTitle: 'What this page should avoid',
    objectionBody: 'Compression pages often drift into vague promises about “quality” and “AI.” The page should stay practical: smaller file, cleaner handoff, local workflow.',
    ctaNote: 'Open Compress PDF when the document is ready but still too heavy for the next step in the workflow.',
    quickAnswers: [
      {
        question: 'What is the outcome users care about?',
        answer: 'A smaller file that is easier to send, upload, or archive without turning compression into a separate waiting loop.',
      },
      {
        question: 'Why keep this page simple?',
        answer: 'Compression converts poorly when the messaging is vague. Users want to know the next handoff becomes easier.',
      },
      {
        question: 'What should this route avoid?',
        answer: 'Overclaiming around image quality, AI, or impossible size reduction promises.',
      },
    ],
  },
  {
    slug: 'split-pdf',
    title: 'Split PDF files locally when one document needs to become several',
    metaTitle: 'Split PDF locally | LocalPDF',
    metaDescription: 'Split PDF files locally with LocalPDF for cleaner handoffs, extraction, and document reuse.',
    socialImage: 'https://localpdf.online/og/split-pdf.svg',
    intro: 'Split workflows are common in operations and document review. The product should make them feel direct and controlled.',
    appHash: 'split',
    eyebrow: 'Split PDF',
    capabilities: [
      'Break a PDF into smaller outputs',
      'Extract sections for sharing or filing',
      'Keep structural document work inside the LocalPDF app',
    ],
    whyLocal: [
      'Users often split documents specifically to share less, not more.',
      'A local split flow reinforces that selective sharing can start before any upload.',
      'The job is operational and should feel low-friction.',
    ],
    howItWorks: [
      'Open Split PDF.',
      'Choose the pages or ranges you need.',
      'Export the new files.',
    ],
    useCases: [
      'Separate a signed page from a contract package',
      'Break a long report into sections',
      'Extract only the pages needed for external review',
    ],
    proofTitle: 'Split pages before they leave your machine',
    proofBody: 'This is a clean trust argument and a strong message for both SEO and product clarity.',
    objectionTitle: 'Why this route matters',
    objectionBody: 'Users often split documents to share less information, not more. The page should make that trust logic obvious.',
    ctaNote: 'Open Split PDF when one large document needs to become several smaller outputs under your control.',
    quickAnswers: [
      {
        question: 'What is the user trying to control?',
        answer: 'Which pages leave the original file, which pages stay private, and how the output is shared afterwards.',
      },
      {
        question: 'Why does local-first help here?',
        answer: 'The split often happens specifically to reduce exposure before any later upload or external handoff.',
      },
      {
        question: 'What should the page make clear?',
        answer: 'That the job is selective extraction and cleaner sharing, not just mechanical page separation.',
      },
    ],
  },
  {
    slug: 'sign-pdf',
    title: 'Sign PDF documents locally and keep approval flows simple',
    metaTitle: 'Sign PDF locally | LocalPDF',
    metaDescription: 'Sign PDF documents locally with LocalPDF for quick approvals and lightweight document workflows.',
    socialImage: 'https://localpdf.online/og/sign-pdf.svg',
    intro: 'Signing is a trust-sensitive workflow because signatures are personal, reusable, and easy to mishandle in weak tools.',
    appHash: 'sign',
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
    proofTitle: 'Signing pages need calm trust signals',
    proofBody: 'Avoid legal overclaiming. Focus on the local workflow, the reduced friction, and the product experience.',
    objectionTitle: 'What the page should not do',
    objectionBody: 'It should not overstate legality or turn trust into hype. The value is a simple signing flow that remains close to the document.',
    ctaNote: 'Open Sign PDF when the job is quick approval, lightweight signature placement, and a shorter path from document to completion.',
    quickAnswers: [
      {
        question: 'What is the page really selling?',
        answer: 'A simpler path from document to signed output when the user needs a lightweight approval step.',
      },
      {
        question: 'Why stay careful with the copy?',
        answer: 'Signature workflows can easily drift into legal overclaiming. The page should stay grounded in product behavior, not legal theater.',
      },
      {
        question: 'What should make users trust it?',
        answer: 'A direct local flow, clear limits, and less bouncing between unrelated PDF utilities.',
      },
    ],
  },
  {
    slug: 'convert-pdf',
    title: 'Convert PDFs and related document formats in one local workflow',
    metaTitle: 'Convert PDF locally | LocalPDF',
    metaDescription: 'Convert PDFs and related document formats in one LocalPDF workflow instead of jumping between separate one-off tools.',
    socialImage: 'https://localpdf.online/og/convert-pdf.svg',
    intro: 'Conversion should be one canonical feature page, not a spread of weak near-duplicate landing pages.',
    appHash: 'pdf-to-word',
    eyebrow: 'Convert PDF',
    capabilities: [
      'Handle common PDF conversion workflows in one place',
      'Reduce page sprawl across similar conversion jobs',
      'Give users one conversion entry point inside the app',
    ],
    whyLocal: [
      'Conversion pages often create SEO noise and duplicate intent.',
      'A single strong conversion page is easier to maintain and easier to trust.',
      'The product should feel like one workspace, not a maze of thin routes.',
    ],
    howItWorks: [
      'Open Convert PDF.',
      'Choose the source format and target output path inside the app flow.',
      'Review and export the converted result.',
    ],
    useCases: [
      'Prepare a PDF for editable reuse',
      'Generate a PDF from a document source',
      'Move between document and image-based workflows',
    ],
    proofTitle: 'One conversion hub is stronger than four weak landing pages',
    proofBody: 'This page should centralize the conversion story and reduce route duplication.',
    objectionTitle: 'Why this is one page',
    objectionBody: 'Conversion intent was previously spread across weak routes. A single stronger page is easier to maintain, easier to understand, and easier to trust.',
    ctaNote: 'Open Convert PDF when the workflow is about moving between document formats without leaving the main LocalPDF product path.',
    quickAnswers: [
      {
        question: 'Why unify conversion into one page?',
        answer: 'Because users are choosing a product path, not browsing a directory of near-duplicate conversion routes.',
      },
      {
        question: 'What does this help explain?',
        answer: 'That LocalPDF handles conversion as part of a wider document workflow rather than as isolated SEO fragments.',
      },
      {
        question: 'What should the page make easy?',
        answer: 'Choosing the right conversion path and moving straight into the app without second-guessing where to start.',
      },
    ],
  },
];

export function getFeaturePage(slug: string) {
  return featurePages.find((page) => page.slug === slug);
}
