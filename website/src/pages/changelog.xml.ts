import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { changelog } from '../data/changelog';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function GET(context: APIContext) {
  return rss({
    title: 'LocalPDF changelog',
    description: 'What shipped in LocalPDF — text editing, OCR, redaction verification, sharing, limits and the local MCP server.',
    site: context.site ?? 'https://localpdf.online',
    items: changelog.map((entry) => ({
      title: entry.title,
      description: `${entry.summary} ${entry.items.join(' ')}`,
      pubDate: new Date(`${entry.date}T12:00:00Z`),
      link: `https://localpdf.online/changelog#${entry.date}-${slugify(entry.title)}`,
    })),
    customData: '<language>en</language>',
  });
}
