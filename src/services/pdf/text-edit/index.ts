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
export { resolveTypographyFromElement, resolveFontSizeFromElement } from './font-resolve';
