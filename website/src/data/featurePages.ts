import type { CanvasToolId, FeaturePageSlug } from '../../../shared/seo-app-targets';
import { auto_toc_pdf } from './features/auto-toc-pdf';
import { compress_pdf } from './features/compress-pdf';
import { convert_pdf } from './features/convert-pdf';
import { edit_pdf } from './features/edit-pdf';
import { merge_pdf } from './features/merge-pdf';
import { ocr_pdf } from './features/ocr-pdf';
import { protect_pdf } from './features/protect-pdf';
import { sign_pdf } from './features/sign-pdf';
import { split_pdf } from './features/split-pdf';

export interface FeaturePageData {
  slug: FeaturePageSlug;
  title: string;
  metaTitle: string;
  metaDescription: string;
  socialImage?: string;
  /**
   * Canvas demos captured from the running app by `npm run demo:studio-clips`.
   * Only list tools that were actually recorded — no mockups or staged stills.
   *
   * `title`, `description` and `transcript` feed the VideoObject markup: the title must be unique
   * across the site, the description unique to its clip, and the transcript has to describe what
   * is on screen — the clips are silent, so that text is their only machine-readable record.
   * `alt` and `caption` stay short: they are the aria-label and the visible figcaption.
   */
  demoVideos?: Array<{
    /** Silent H.264 clip; the poster is what reduced-motion visitors see. */
    src: string;
    poster: string;
    alt: string;
    caption: string;
    title?: string;
    description?: string;
    transcript?: string;
  }>;
  intro: string;
  /** Studio tool this page opens; null means the canvas itself (merge, split, convert). */
  canvasTool: CanvasToolId | null;
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
  /** "Which jobs this covers" block. Keep the copy written for the reader, never for the crawler. */
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

/**
 * Each page lives in its own module under `./features/` so the sitemap can date a feature URL
 * from the file whose content actually changed, instead of giving all nine the same lastmod.
 */
export const featurePages: FeaturePageData[] = [
  edit_pdf,
  merge_pdf,
  ocr_pdf,
  compress_pdf,
  split_pdf,
  sign_pdf,
  convert_pdf,
  auto_toc_pdf,
  protect_pdf,
];

export function getFeaturePage(slug: string) {
  return featurePages.find((page) => page.slug === slug);
}
