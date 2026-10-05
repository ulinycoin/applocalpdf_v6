/**
 * Single source of truth for the local-processing claim.
 *
 * Document contents are processed in the browser and are never uploaded. The site around the
 * tool is ordinary web software — hosting, analytics, billing, license validation — and the
 * copy must say so. Every page that makes a local-processing claim should use one of these
 * strings instead of writing its own absolute, so marketing and the privacy policy cannot drift
 * apart again. `npm run audit:seo-copy` fails the build when an unsupported absolute reappears.
 */

/** Hero-size badge. Safe on its own because it names the file, not the whole site. */
export const PDF_NEVER_UPLOADED_SHORT = 'Your PDF is never uploaded';

/** One-line scope note for feature and landing pages. */
export const LOCAL_PROCESSING_SCOPE =
  'The PDF is opened, processed, and exported in your browser — it is not uploaded. Hosting, analytics, billing, and license validation are ordinary web infrastructure.';

/** Full boundary statement for trust pages, FAQ answers, and footer-level disclosure. */
export const LOCAL_PROCESSING_BOUNDARY =
  'Core PDF processing stays in your browser on your device. Document contents are not uploaded to a processing server or stored by LocalPDF. The site around the tool still uses normal web infrastructure: hosting, analytics, billing, and license validation.';
