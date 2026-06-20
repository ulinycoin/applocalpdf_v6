export {
  buildOriginalRect,
  normalizeOriginalRectInput,
  resolveTargetRect,
  textElementMovedFromOriginal,
  type NormalizedOriginalRect,
} from './original-rect';
export { isStudioTextEditV2Enabled } from './feature-flag';
export { inferSourceTextStyle } from './infer-source-text-style';
export {
  dedupeStackedTextLayerSpans,
  filterSpansForLineMerge,
  filterTextLayerSpansByEditedElements,
  spanCenterOverlapsRect,
  type TextLayerSpanBounds,
} from './span-filter';
