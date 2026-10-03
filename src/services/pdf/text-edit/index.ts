export {
  buildOriginalRect,
  normalizeOriginalRectInput,
  resolveTargetRect,
  textElementMovedFromOriginal,
  type NormalizedOriginalRect,
} from './original-rect';
export {
  collectOperatorsForRedaction,
  collectOperatorsInRect,
  operatorIntersectsRect,
  matchesPatchedOperator,
  redactOperatorsInDecodedStreams,
  removeOperatorsFromContent,
  sameStreamOperator,
  type DecodedPdfStreamSlice,
  type StreamOperatorRef,
} from './stream-redaction';
export {
  dedupeStackedTextLayerSpans,
  filterSpansForLineMerge,
  filterTextLayerSpansByEditedElements,
  spanCenterOverlapsRect,
} from './span-filter';
export { isStudioTextEditV2Enabled } from './feature-flag';
export {
  resolveRequestedFontSizeFromElement,
  resolveTypographyFromElement,
  resolveFontSizeFromElement,
} from './font-resolve';
export {
  inferTypographyFromBaseFont,
  resolveSourceFontInfo,
  type SourceFontInfo,
} from './source-font';
export {
  countMissingGlyphs,
  pickCoveringFont,
  type EncodableFont,
} from './glyph-coverage';
export {
  collectLinkedBackgroundOwners,
  isCoverRect,
  isUserCoverRect,
} from './cover-rect';
export {
  normalizeRotation,
  resolvePageGeometry,
  type PageGeometry,
  type PageRotation,
} from './page-rotation';
export {
  measureSegments,
  planTextSegments,
  type SegmentedTextRun,
} from './segmented-text';
