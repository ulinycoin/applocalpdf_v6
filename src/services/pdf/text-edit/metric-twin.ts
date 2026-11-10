import twinManifest from '../../../../shared/studio-text-edit/metric-twins.json';

/**
 * Metric-compatible stand-ins for the faces a PDF already uses.
 *
 * Reuse of the embedded program is the honest way to keep a document's typeface, but it is capped by
 * the subset: in a real corpus fewer than half of edits contain only characters the subset already
 * has (`.agent/tasks.md`, 2026-11-11). The rest were substituted with Helvetica/Roboto, which is what
 * users describe as "the font changed": Calibri set in Helvetica is wider, rounder and obviously
 * foreign even at 10 pt.
 *
 * These faces have the same advance widths as the originals (Arimo/Arial, Tinos/Times New Roman,
 * Cousine/Courier New, Carlito/Calibri, Caladea/Cambria), so text drawn with them keeps the original
 * line breaks, spacing and column widths. The glyph shapes differ slightly; the layout does not.
 *
 * Everything here is a hint, never a claim: the caller still runs the usual coverage gate, and a twin
 * that cannot render a character is skipped exactly like any other candidate.
 */

export interface MetricTwin {
  id: string;
  label: string;
  /** Original faces this stands in for, for docs and telemetry. */
  metricFor: readonly string[];
  /** Subsets that exist for this family; a missing one simply falls through to the next candidate. */
  subsets: readonly string[];
}

interface TwinManifest {
  families: Array<{
    id: string;
    label: string;
    metricFor: string[];
    patterns: string[];
    subsets: string[];
  }>;
}

const manifest = twinManifest as TwinManifest;

const TWINS: MetricTwin[] = manifest.families.map((family) => ({
  id: family.id,
  label: family.label,
  metricFor: family.metricFor,
  subsets: family.subsets,
}));

/** Longest pattern wins, so `cambria` is decided before a generic `serif`-style rule could match. */
const MATCHERS: Array<{ pattern: string; twin: MetricTwin }> = manifest.families
  .flatMap((family) => family.patterns.map((pattern) => ({ pattern, twin: TWINS.find((twin) => twin.id === family.id)! })))
  .sort((a, b) => b.pattern.length - a.pattern.length);

export function metricTwins(): readonly MetricTwin[] {
  return TWINS;
}

export function normalizePdfFontName(name?: string): string {
  if (!name) {
    return '';
  }
  return name
    .replace(/^[A-Z]{6}\+/u, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');
}

/** Twin for a PostScript font name (`BCDEEE+Calibri-Bold`), or undefined when none is known. */
export function resolveMetricTwin(baseFont?: string): MetricTwin | undefined {
  const name = normalizePdfFontName(baseFont);
  if (!name) {
    return undefined;
  }
  return MATCHERS.find((matcher) => name.includes(matcher.pattern))?.twin;
}

/**
 * Slices the text actually needs, most specific first.
 *
 * A face is split by script and the split does not follow the text: the Cyrillic slice has no ASCII
 * and the Latin slice has no `ē`, so a mixed string is drawn run by run from two slices of the same
 * family — same metrics either way. Only the slices the text needs are downloaded and embedded; an
 * eager four-slice fetch per edit added ~7% to a 113 KB document for a single ASCII line.
 */
export function metricTwinSubsetsFor(twin: MetricTwin, text: string): string[] {
  const wanted: string[] = [];
  if (/[\u0100-\u024F]/u.test(text)) wanted.push('latin-ext');
  if (/[\u0400-\u04FF]/u.test(text)) wanted.push('cyrillic');
  if (/[\u0370-\u03FF]/u.test(text)) wanted.push('greek');
  if (/[\u0020-\u007E\u00A0-\u00FF]/u.test(text) || wanted.length === 0) wanted.push('latin');
  return wanted.filter((subset) => twin.subsets.includes(subset));
}

const FONT_WEIGHT_CODE = { normal: '400', bold: '700' } as const;

/** `fonts/arimo-latin-400-normal.woff` — the layout `copy-studio-fonts.mjs` produces. */
export function metricTwinAssetFile(
  twin: MetricTwin,
  subset: string,
  weight: 'normal' | 'bold',
  style: 'normal' | 'italic',
): string {
  return `fonts/${twin.id}-${subset}-${FONT_WEIGHT_CODE[weight]}-${style}.woff`;
}

/** Every asset to try for this text, best first. */
export function metricTwinAssetFiles(
  twin: MetricTwin,
  weight: 'normal' | 'bold',
  style: 'normal' | 'italic',
  text: string,
): string[] {
  return metricTwinSubsetsFor(twin, text).map((subset) => metricTwinAssetFile(twin, subset, weight, style));
}

/**
 * Drift of a twin's advance widths against the face it replaces, measured on the strings a document
 * would actually contain. Used by `scripts/measure-metric-twins.mjs`; kept here so the rule and the
 * measurement cannot disagree about which faces are twins.
 */
export const METRIC_TWIN_PROBE_TEXT = 'Rēķins Rīga 2026 Invoice Total 1 234,56 EUR';
