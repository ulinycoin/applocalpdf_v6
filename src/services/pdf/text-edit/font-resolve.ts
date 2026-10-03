import type { WorkerStudioFontFamilyId, WorkerStudioTextEditElement } from '../../../core/types/contracts';
import { clamp, inferSourceTextStyle, normalizeFontFamilyFromString } from '../studio-text-edit-utils';
import { inferTypographyFromBaseFont } from './source-font';

interface ResolvedTypography {
  fontFamily: WorkerStudioFontFamilyId;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
}

function inferTypographyFromSource(element: WorkerStudioTextEditElement): ResolvedTypography {
  const fontFamily = normalizeFontFamilyFromString(
    element.sourceFontName ?? element.sourceFontFamilyHint ?? element.fontFamily,
  );
  const { fontWeight, fontStyle } = inferSourceTextStyle(
    element.sourceFontName,
    element.sourceFontFamilyHint,
  );
  return { fontFamily, fontWeight, fontStyle };
}

function hasSourceTypography(element: WorkerStudioTextEditElement): boolean {
  return Boolean(element.sourceFontName || element.sourceFontFamilyHint || element.sourceFontSizeRatio !== undefined);
}

/**
 * Typography to render with.
 *
 * The element is compared against what the *hints* alone imply — that is what the editor seeds a
 * freshly clicked line with. If the element still matches the hints, nothing was chosen by hand,
 * so the exact PostScript name from the content stream (`Times-BoldItalic`) is used instead of the
 * generic family pdf.js reported. A deliberate choice in the UI keeps winning.
 */
export function resolveTypographyFromElement(
  element: WorkerStudioTextEditElement,
  sourceBaseFont?: string,
): ResolvedTypography {
  if (!hasSourceTypography(element)) {
    return {
      fontFamily: element.fontFamily,
      fontWeight: element.fontWeight,
      fontStyle: element.fontStyle,
    };
  }

  const fromHints = inferTypographyFromSource(element);
  const customized = element.fontFamily !== fromHints.fontFamily
    || element.fontWeight !== fromHints.fontWeight
    || element.fontStyle !== fromHints.fontStyle;
  if (customized) {
    return {
      fontFamily: element.fontFamily,
      fontWeight: element.fontWeight,
      fontStyle: element.fontStyle,
    };
  }

  return inferTypographyFromBaseFont(sourceBaseFont) ?? fromHints;
}

/** Size in points the user actually asked for, falling back to the size of the source run. */
export function resolveRequestedFontSizeFromElement(
  element: WorkerStudioTextEditElement,
  pageHeight: number,
): { fontSize: number; changedFromSource: boolean } {
  const sourceSize = element.sourceFontSizeRatio !== undefined
    ? element.sourceFontSizeRatio * pageHeight
    : undefined;
  const elementSize = element.fontSize || 12;

  if (sourceSize === undefined) {
    return { fontSize: clamp(elementSize, 4, 144), changedFromSource: false };
  }

  if (Math.abs(elementSize - sourceSize) > 0.75) {
    return { fontSize: clamp(elementSize, 4, 144), changedFromSource: true };
  }

  return { fontSize: clamp(sourceSize, 4, 144), changedFromSource: false };
}

export function resolveFontSizeFromElement(
  element: WorkerStudioTextEditElement,
  pageHeight: number,
): number {
  return resolveRequestedFontSizeFromElement(element, pageHeight).fontSize;
}
