import videoManifest from '../data/video-manifest.json';

/**
 * VideoObject JSON-LD for the on-site demo clips.
 *
 * Fields and required-vs-recommended split follow Google's video structured data reference
 * (https://developers.google.com/search/docs/appearance/structured-data/video): `name`,
 * `thumbnailUrl` and `uploadDate` are required, `description`, `duration` and `contentUrl` are
 * recommended, and `contentUrl` is the most reliable way for Google to fetch the media itself.
 * `transcript` is not something Google reads today; it is the schema.org property that turns a
 * silent screencast into text a model can quote, which is the point for a page whose only visual
 * evidence is a recording.
 *
 * Durations and publish dates come from `scripts/gen-video-manifest.mjs` (ffprobe + the commit
 * that added the clip), never from a guess. A clip missing from the manifest is skipped rather
 * than emitted with invented values.
 */

const SITE_ORIGIN = 'https://localpdf.online';
const PUBLISHER = {
  '@type': 'Organization',
  name: 'LocalPDF',
  url: SITE_ORIGIN,
};

type VideoManifest = Record<string, { duration: string; uploadDate: string }>;

export interface DemoVideoEntry {
  /** Always the generic name on the page ("Watch the tool work on the canvas"). */
  title: string;
  description: string;
  transcript: string;
  src: string;
  poster: string;
}

const MANIFEST: VideoManifest = videoManifest;

export function buildVideoObjects(
  videos: DemoVideoEntry[],
  options: { pageUrl: string; language?: string } = { pageUrl: `${SITE_ORIGIN}/` },
): Array<Record<string, unknown>> {
  return videos.flatMap((video) => {
    const facts = MANIFEST[video.src];
    if (!facts) {
      return [];
    }
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: video.title,
        description: video.description,
        thumbnailUrl: [new URL(video.poster, SITE_ORIGIN).href],
        uploadDate: facts.uploadDate,
        duration: facts.duration,
        contentUrl: new URL(video.src, SITE_ORIGIN).href,
        transcript: video.transcript,
        inLanguage: options.language ?? 'en',
        creator: PUBLISHER,
        publisher: PUBLISHER,
        isPartOf: { '@type': 'WebPage', '@id': options.pageUrl },
      },
    ];
  });
}
