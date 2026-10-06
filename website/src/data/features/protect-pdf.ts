import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../../shared/seo-app-targets';
import type { FeaturePageData } from '../featurePages';

/**
 * Content for /features/protect-pdf.
 * One file per page so the sitemap can date each URL from the file that actually changed.
 */
export const protect_pdf: FeaturePageData = {
    slug: 'protect-pdf',
    title: 'Protect PDF — Add a password without uploading',
    metaTitle: 'Protect PDF Locally — Add a Password, No Upload | LocalPDF',
    metaDescription: 'Add an open password, an owner password, or permission restrictions to a PDF in your browser. The file and the password never leave your device.',
    intro: 'Password protection is the one PDF job where sending the file to a server defeats the point. LocalPDF encrypts the document in your browser instead.',
    demoVideos: [
      {
        src: '/demo/localpdf-protect-pdf-password.mp4',
        poster: '/demo/localpdf-protect-pdf-password-poster.webp',
        alt: 'Setting an open password with the Protect tool in the LocalPDF canvas editor and applying AES-256 encryption',
        caption: 'Choosing a preset, setting an open password, and encrypting the document. Recorded from the running app.',
        title: 'Set an open password and encrypt a PDF with AES-256',
        description: 'A protection preset applied, an open password typed, and the document encrypted from the canvas. Recorded from the running app.',
        transcript: 'A contract is open with the Protect tool active. A preset is chosen from Basic, Business or Confidential, and the encryption level is confirmed as AES-256 with a High security level. The open password field is filled in, and the Protect action is applied, after which the document is exported encrypted. The password stays in the browser tab and the plaintext document is never held by a server.',
      },
    ],
    canvasTool: FEATURE_PAGE_CANVAS_TOOLS['protect-pdf'],
    eyebrow: 'Protect PDF',
    capabilities: [
      'Require a password to open the document',
      'Restrict printing, copying, modifying, annotating, and form filling',
      'Choose AES-256 or AES-128 encryption',
      'Apply it from the canvas without leaving the workspace',
    ],
    whyLocal: [
      'A password-protected document is only as private as the service that processed it. Uploading a file to add a password hands that file to someone else first.',
      'The password you type stays in the browser tab. There is no server-side job holding the plaintext document and its password at the same time.',
      'Encryption happens locally, so the protected file is written on your device and nowhere else.',
    ],
    howItWorks: [
      'Open the document in the Studio and pick Protect from the tool rail.',
      'Choose a preset (Basic, Business, Confidential) or set permissions manually.',
      'Add an open password, an owner password, or restrict permissions only.',
      'Apply protection and download the encrypted PDF.',
    ],
    useCases: [
      'Send a contract or invoice that only the recipient should open',
      'Block copying and editing in a document that still needs to be readable',
      'Set an owner password so recipients cannot lift your restrictions',
      'Protect HR, finance, or client files without a third-party service seeing them',
    ],
    proofTitle: 'Encryption that never leaves the browser',
    proofBody: 'The Studio applies AES-256 or AES-128 encryption to the document and writes the protected file locally. The demo above is a recording of that flow on a contract page.',
    objectionTitle: 'What local protection does not do',
    objectionBody: 'LocalPDF protects the file itself. It does not manage passwords for you, and it cannot recover an open password you forget — there is no server-side copy to reset. Keep the password somewhere safe.',
    ctaNote: 'Open Protect PDF when a document needs a password or permission restrictions before it leaves your device.',
    quickAnswers: [
      {
        question: 'Can I password-protect a PDF without uploading it?',
        answer: 'Yes. The Protect tool runs in your browser: the document is encrypted locally with AES-256 or AES-128, and the plaintext file and password are never sent to a server.',
      },
      {
        question: 'What is the difference between an open password and an owner password?',
        answer: 'An open password is required to open the document at all. An owner password is required to change the restrictions — someone can read the file but cannot lift limits such as blocked copying or printing.',
      },
      {
        question: 'Can I restrict printing or copying without a password?',
        answer: 'Yes. Restrictions-only mode sets permissions without asking for a password to open the file. Anyone can read the document, but the restrictions you chose still apply.',
      },
      {
        question: 'What happens if I forget the password?',
        answer: 'There is no recovery. The file is encrypted on your device and LocalPDF keeps no copy, so a forgotten open password means the document cannot be opened.',
      },
    ],
    intentSection: {
      title: 'Protection jobs',
      intro: 'Protecting a document means deciding who can open it and what a recipient is allowed to do with it afterwards.',
      items: [
        {
          title: 'Add a password to a PDF before sharing it',
          body: 'Use this workflow when a contract, invoice, or internal record has to be opened only by the intended recipient.',
        },
        {
          title: 'Restrict copying, printing, or editing in a PDF',
          body: 'Restrictions-only mode limits what a recipient can do with the document without adding a password prompt to every open.',
        },
        {
          title: 'Choose an encryption level for a sensitive document',
          body: 'Pick AES-256 for client, HR, and finance files, or AES-128 when the receiving system is older and needs the lower level.',
        },
      ],
    },
    blogLinks: [
      { href: '/features/edit-pdf', title: 'Edit PDF locally' },
      { href: '/security', title: 'Security & privacy model' },
    ],
    monetizationBlock: {
      eyebrow: 'Free vs Pro',
      title: 'Every tool is free — protection included',
      body: 'Protect PDF, merge, split, compress, OCR, editing and conversion all run free on every plan. Pro removes the free-tier limits: unlimited downloads and unlimited Studio workspaces, one-time $19, no subscription.',
      primaryCtaLabel: 'See Pro plans',
      secondaryCtaLabel: 'Open Protect PDF',
    },
  };
