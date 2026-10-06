/**
 * Canvas demo clips for the non-feature pages (home, private editor).
 *
 * Lives here rather than in `astro.config.mjs` because three consumers need the same copy: the
 * video sitemap entries, the VideoObject markup on the page (`src/utils/video-object.ts`), and
 * the visible `<video>` elements. Feature-page clips live with their page in `./features/<slug>.ts`.
 *
 * `title` must be unique across the whole site and `description` unique to its clip (Google's
 * guidance for VideoObject); `transcript` must describe what is actually on screen, because the
 * clips are silent. `alt` and `caption` stay short — aria-label and visible figcaption.
 */
export interface DemoVideoCopy {
  src: string;
  poster: string;
  /** Short; used as the <video> aria-label. */
  alt: string;
  /** Short; used as the visible figcaption. */
  caption: string;
  /** Unique site-wide; VideoObject `name` and sitemap `<video:title>`. */
  title: string;
  /** Unique to this clip; VideoObject `description` and sitemap `<video:description>`. */
  description: string;
  /** Prose description of the recording; VideoObject `transcript`. */
  transcript: string;
}

export const PAGE_DEMO_VIDEOS: Record<string, DemoVideoCopy[]> = {
  '/': [
    {
      src: '/demo/localpdf-drag-pages-between-documents.mp4',
      poster: '/demo/localpdf-drag-pages-between-documents-poster.webp',
      alt: 'Dragging a page out of workspace-a.pdf and dropping it into workspace-b.pdf on the LocalPDF canvas',
      caption: 'A page dragged from one workspace into another. Recorded from the running app.',
      title: 'Drag a page from one PDF into another on the same canvas',
      description:
        'A page lifted out of one workspace and dropped into a second open PDF, leaving the source document one page shorter. Recorded from the running app.',
      transcript:
        'Two PDF files are open side by side on the LocalPDF canvas: workspace-a.pdf with three pages and workspace-b.pdf with two. The pointer picks up the third page of workspace-a.pdf, drags it across the canvas, and drops it onto workspace-b.pdf. The page is copied into the second document, which now holds three pages, and the source workspace is left with two. Nothing is uploaded at any point — the move happens on files already open in the browser.',
    },
  ],
  '/private-pdf-editor': [
    {
      src: '/demo/localpdf-redact-pdf-whiteout.mp4',
      poster: '/demo/localpdf-redact-pdf-whiteout-poster.webp',
      alt: 'Painting a whiteout box over the confidential account line of a service agreement in the LocalPDF canvas',
      caption: 'Redacting an account line on the page. Recorded from the running app.',
      title: 'Whiteout a confidential account line on a contract page',
      description:
        'The whiteout tool painted over the masked account line of a service agreement until the text underneath is unreadable. Recorded from the running app.',
      transcript:
        'A one-page service agreement is open in the LocalPDF canvas. The Markup tool is selected, then the whiteout swatch, and a colour is picked from the palette. A box is painted over the line reading "Confidential - Account 4417-0092" until the text underneath is covered, while the surrounding clauses stay untouched. The change is baked into the page locally, so the unredacted version is never sent to a server; the redacted file is written in the browser.',
    },
  ],
};
