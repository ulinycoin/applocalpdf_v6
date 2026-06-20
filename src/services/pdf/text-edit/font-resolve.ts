import type { WorkerStudioFontFamilyId, WorkerStudioTextEditElement } from '../../../core/types/contracts';
import { clamp, inferSourceTextStyle, normalizeFontFamilyFromString } from '../studio-text-edit-utils';

function inferTypographyFromSource(element: WorkerStudioTextEditElement): {
  fontFamily: WorkerStudioFontFamilyId;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
} {
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

function typographyCustomizedByUser(element: WorkerStudioTextEditElement): boolean {
  if (!hasSourceTypography(element)) {
    return true;
  }
  const inferred = inferTypographyFromSource(element);
  return element.fontFamily !== inferred.fontFamily
    || element.fontWeight !== inferred.fontWeight
    || element.fontStyle !== inferred.fontStyle;
}

export function resolveTypographyFromElement(element: WorkerStudioTextEditElement): {
  fontFamily: WorkerStudioFontFamilyId;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
} {
  if (typographyCustomizedByUser(element)) {
    return {
      fontFamily: element.fontFamily,
      fontWeight: element.fontWeight,
      fontStyle: element.fontStyle,
    };
  }
  return inferTypographyFromSource(element);
}

export function resolveFontSizeFromElement(
  element: WorkerStudioTextEditElement,
  pageHeight: number,
): number {
  const sourceSize = element.sourceFontSizeRatio !== undefined
    ? element.sourceFontSizeRatio * pageHeight
    : undefined;
  const elementSize = element.fontSize || 12;

  if (sourceSize === undefined) {
    return clamp(elementSize, 4, 144);
  }

  if (Math.abs(elementSize - sourceSize) > 0.75) {
    return clamp(elementSize, 4, 144);
  }

  return clamp(sourceSize, 4, 144);
}
