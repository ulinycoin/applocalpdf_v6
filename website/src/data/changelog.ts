/**
 * Changelog entries, newest first. Dates are ship dates, not build numbers:
 * LocalPDF is a website, so every visitor is already on the newest version.
 * Keep each entry short and in user language — this page is read by people
 * deciding whether the product is alive and by models citing what changed.
 */
export type ChangelogEntry = {
  date: string;
  title: string;
  summary: string;
  items: string[];
  links?: { label: string; href: string }[];
};

export const changelog: ChangelogEntry[] = [
  {
    date: '2026-11-27',
    title: 'Studio workspaces are unlimited on every plan',
    summary:
      'The wall now lives where the business model says it should: at the download, not at the fourth document you open.',
    items: [
      'Free opens as many documents as you want in the canvas — the three-workspace cap is gone.',
      'Free still includes three downloads per day; Pro removes that limit and allows larger files.',
      'The workspace upsell modal no longer interrupts file import, new workspaces or exports.',
      'Pricing, FAQ, comparison pages and the in-app copy were updated to say exactly that.',
    ],
    links: [{ label: 'Pricing', href: '/pricing' }],
  },
  {
    date: '2026-11-27',
    title: 'localpdf-mcp 0.1.4 and a page for AI agents',
    summary:
      'The offline PDF engine for AI agents is public on npm and in the official MCP Registry, with a Dockerfile for self-hosters.',
    items: [
      'Seven tools: inspect, merge, split, compress, extract text, replace text, OCR — all local.',
      'Results are metadata (paths, sizes, checksums, counts), never document bytes or text, so an agent cannot leak your file.',
      'Nodes 20 or older now stop with a clear message instead of crashing inside pdf.js.',
      'The MCP page is available to models as markdown via Accept: text/markdown.',
    ],
    links: [
      { label: 'PDF MCP Server', href: '/pdf-mcp-server' },
      { label: 'npm package', href: 'https://www.npmjs.com/package/localpdf-mcp' },
    ],
  },
  {
    date: '2026-11-26',
    title: 'Redaction you can verify',
    summary:
      'Whiteout deletes the text under the box and the saved file is checked afterwards — the page now explains that workflow.',
    items: [
      'Redaction removes the text operators under the box before the cover is drawn.',
      'The saved file is re-opened and checked for extractable text, metadata, annotations and raw byte leftovers.',
      'A certificate with input/output SHA-256 and hashes of the removed strings is offered only when every check passes.',
      'The converter page stopped promising PDF to Word: Word, Excel and images convert into PDF, not back.',
    ],
    links: [{ label: 'Redact PDF', href: '/features/redact-pdf' }],
  },
  {
    date: '2026-11-25',
    title: 'OCR stops returning garbage on PDFs with embedded text',
    summary:
      'Some PDFs produced text shifted by a constant offset because the browser engine was not started; now the real engine runs or the text is rejected and OCR takes over.',
    items: [
      'The pdf.js worker is configured inside the tool worker, so the browser path reads the real text layer.',
      'Mis-decoded text (control characters, one-letter tokens) is rejected instead of passed off as OCR output.',
      'A regression test uses the file that reported the bug.',
    ],
    links: [{ label: 'OCR PDF', href: '/features/ocr-pdf' }],
  },
  {
    date: '2026-11-25',
    title: 'Share to phone works again',
    summary:
      'The share host started wrapping downloads in an HTML page, which broke the encrypted share link. The receiver now resolves the real file first.',
    items: [
      'Shared links open the download page, follow the signed direct link and decrypt only the real file.',
      'An HTML page is no longer fed to the decryptor, so the "E2EE decryption failed" error is gone.',
    ],
  },
  {
    date: '2026-11-23',
    title: 'Arabic and Hebrew edits are no longer mirrored',
    summary:
      'RTL text is now painted from the browser canvas instead of writing logical-order codes into a visual-order stream, which used to reverse the line.',
    items: [
      'Editing right-to-left text keeps the words in the right order and joins the letters correctly.',
      'The source font is no longer reused for RTL runs; a rasterised line replaces it.',
      'Latin, Cyrillic, Greek and CJK runs still use the original font where it can be reused.',
    ],
    links: [{ label: 'Edit PDF', href: '/features/edit-pdf' }],
  },
  {
    date: '2026-11-23',
    title: 'Edits in CJK PDFs stay searchable',
    summary:
      'Lines re-rendered from the page image now carry an invisible text layer built from a glyph-less font, so the result can still be found and copied.',
    items: [
      'Each rasterised run gets its own hidden font with /ToUnicode, sized from measured per-character advances.',
      'Text extraction from the saved PDF returns the edited line.',
      'Arabic and Hebrew keep the visual raster without a fake search layer, because bidi reordering is not stable there yet.',
    ],
  },
  {
    date: '2026-11-22',
    title: 'Text edits reuse the document’s own font',
    summary:
      'Composite runs in CFF/OpenType fonts (common in Japanese and Chinese exports) are patched in place instead of being substituted or rasterised.',
    items: [
      'CIDFontType0 fonts with FontFile3 are read and patched with the same CIDs.',
      'Empty /W arrays fall back to /DW; widths are checked per CID before a character is accepted.',
      'The overlay cover colour is sampled from the page itself, so a white box no longer appears on tinted or dark backgrounds.',
    ],
    links: [{ label: 'Edit PDF', href: '/features/edit-pdf' }],
  },
];
