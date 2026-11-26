import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/redact-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 *
 * Every claim here maps to code that runs on export: the applier removes the text operators under
 * a drawn box (src/services/pdf/studio-text-edit-applier.ts, processRectElement), and the verifier
 * (src/services/pdf/redact-verify/verify-service.ts) re-reads the output for the removed strings,
 * metadata, annotations and raw bytes before a certificate is issued.
 */
export const redact_pdf: FeaturePageData = {
    slug: 'redact-pdf',
    title: 'Redact a PDF Locally — Delete the Text, Then Prove It',
    metaTitle: 'Redact PDF Locally — Verified Deletion, No Upload | LocalPDF',
    metaDescription: 'Black out confidential text in your browser and actually delete it from the file, not just cover it. Every export is checked, and a passing page comes with a certificate. Nothing is uploaded.',
    intro: 'Redaction is the one PDF job where a black rectangle is not the result — the text underneath has to be gone. LocalPDF deletes it in your browser and shows you the check before you download.',
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['redact-pdf'],
    eyebrow: 'Redact PDF',
    capabilities: [
      'Remove the text under a box you draw instead of covering it',
      'Re-check the finished page for the removed strings, metadata, annotations and raw bytes',
      'Download a certificate with the hashes and check results when every check passes',
    ],
    whyLocal: [
      'Documents that need redaction are the ones users least want to hand to a server: contracts, medical records, payslips, HR files.',
      'A black box is only as good as the file behind it. Here the text is removed on the device that already has the file, and the check runs on the same device.',
      'The certificate is generated locally from the file you are about to save, so nothing about the document leaves the tab to produce it.',
    ],
    howItWorks: [
      'Open Redact PDF and load the document.',
      'Pick the Whiteout tool and draw a box over the text, image or table you want gone.',
      'Export: LocalPDF checks the output, lists the results, and offers the certificate when all checks pass.',
    ],
    useCases: [
      'Send a contract with the fee schedule removed',
      'Share a medical record with patient details blacked out',
      'Publish a case study with names and account numbers deleted',
    ],
    proofTitle: 'A redaction you can check before the file leaves your hands',
    proofBody: 'The box is painted only after the text operators under it are removed from the page content stream. On export the applier output is read back and checked for the strings that were removed, then for leftover metadata, annotations and raw bytes — the same four places redaction usually leaks.',
    objectionTitle: 'What people ask before trusting a redaction tool',
    objectionBody: 'Most tools ask you to trust a black rectangle. The honest answer is that covering text and deleting text are different operations, and only one of them survives copy-paste, text search and a metadata dump.',
    ctaNote: 'Open Redact PDF when the job is removing content for good and being able to show what was checked.',
    quickAnswers: [
      {
        question: 'Is the text really deleted, or just covered?',
        answer: 'Deleted. When you draw a whiteout box, LocalPDF removes the text operators under it from the page content stream and then paints the box. Covering alone would leave the text copyable and searchable.',
      },
      {
        question: 'What does the certificate contain?',
        answer: 'A JSON record with the input and output SHA-256 hashes, SHA-256 hashes of the removed strings (never the plaintext), the result of each check, the page count and the number of redactions. It is offered only when every check passes.',
      },
      {
        question: 'What happens if a check fails?',
        answer: 'You still get the PDF, with an explicit warning that text may remain extractable under the box, and no certificate is issued. A skipped check means that page had nothing for it to examine.',
      },
      {
        question: 'Can I redact a PDF without uploading it?',
        answer: 'Yes. Redaction, the checks and the certificate all run in your browser. The document is never sent to a server.',
      },
    ],
    intentSection: {
      title: 'Redaction jobs',
      intro: 'Redaction fits whenever a document has to leave your hands with some of its content permanently removed: names, amounts, diagnoses, addresses, account numbers.',
      items: [
        {
          title: 'Remove personal data before sending a document out',
          body: 'Use this workflow when a contract, record or report has to go to a third party with names, identifiers or figures taken out for good.',
        },
        {
          title: 'Replace a black box with real deletion',
          body: 'A rectangle drawn over text leaves the text in the file. This workflow removes the content underneath, so the result survives copy-paste, search and metadata inspection.',
        },
        {
          title: 'Keep a record of what was checked',
          body: 'When someone downstream asks how the file was prepared, export the certificate alongside the PDF: it names the checks, the hashes and the counts.',
        },
      ],
    },
    blogLinks: [
      { href: '/how-local-pdf-processing-works', title: 'How local PDF processing works' },
      { href: '/security', title: 'Security & privacy model' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Redaction is free on every plan',
      body: 'The checks and the certificate are part of the free workflow. The free tier allows 3 downloads per day and 3 Studio workspaces; Pro removes those limits for recurring document work.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Redact PDF',
    },
  };
