export type StudioEditLocale = 'en' | 'ru' | 'de' | 'es' | 'fr' | 'it' | 'pt' | 'ja' | 'zh';

export interface StudioEditMessages {
  selectPageTitle: string;
  backToCanvas: string;
  switchToManualMode: string;
  switchToSelectTextMode: string;
  selectText: string;
  text: string;
  textFontFamily: string;
  textFontSize: string;
  textColor: string;
  textBackgroundColor: string;
  links: string;
  forms: string;
  watermark: string;
  protect: string;
  images: string;
  sign: string;
  whiteout: string;
  annotate: string;
  annotateUnderline: string;
  annotateHighlight: string;
  annotateMarker: string;
  annotatePen: string;
  annotatePenSize: string;
  annotateCustomColor: string;
  whiteoutCustomColor: string;
  shapeRectangle: string;
  shapeLine: string;
  shapeArrow: string;
  shapeThickness: string;
  shapes: string;
  undo: string;
  redo: string;
  undoSave: string;
  redoSave: string;
  delete: string;
  save: string;
  saving: string;
  saveSelection: string;
  back: string;
  page: string;
  selection: string;
  noTextLayer: string;
  changesApplied: string;
  changesAppliedSelection: string;
  partialSaveFailed: string;
  saveFailed: string;
  unsavedConfirm: string;
  overflowWarning: string;
  statusIdle: string;
  statusHover: string;
  statusSelected: string;
  statusEditing: string;
  statusSaving: string;
  statusSaved: string;
  statusError: string;
  dirty: string;
  saveReverted: string;
  protectPasswordRequired: string;
  protectUnavailable: string;
}

const EN_MESSAGES: StudioEditMessages = {
  selectPageTitle: 'Select a page to start Edit mode',
  backToCanvas: 'Back to Canvas',
  switchToManualMode: 'Switch to Manual Mode',
  switchToSelectTextMode: 'Switch to Select Text Mode',
  selectText: 'Select Text',
  text: 'Text',
  textFontFamily: 'Font',
  textFontSize: 'Size',
  textColor: 'Color',
  textBackgroundColor: 'Background',
  links: 'Links',
  forms: 'Forms',
  watermark: 'Watermark',
  protect: 'Protect',
  images: 'Images',
  sign: 'Sign',
  whiteout: 'Whiteout',
  annotate: 'Annotate',
  annotateUnderline: 'Underline',
  annotateHighlight: 'Highlight',
  annotateMarker: 'Marker',
  annotatePen: 'Pen',
  annotatePenSize: 'Pen size',
  annotateCustomColor: 'Custom',
  whiteoutCustomColor: 'Custom color',
  shapeRectangle: 'Rectangle',
  shapeLine: 'Line',
  shapeArrow: 'Arrow',
  shapeThickness: 'Thickness',
  shapes: 'Shapes',
  undo: 'Undo',
  redo: 'Redo',
  undoSave: 'Undo Save',
  redoSave: 'Redo Save',
  delete: 'Delete',
  save: 'Save',
  saving: 'Saving...',
  saveSelection: 'Save all selected pages',
  back: 'Back',
  page: 'Page',
  selection: 'Selection',
  noTextLayer: 'Inline editing is unavailable: no text layer found.',
  changesApplied: 'Changes applied to PDF page.',
  changesAppliedSelection: 'Changes applied to selected pages:',
  partialSaveFailed: 'Some selected pages failed to save.',
  saveFailed: 'Failed to save changes.',
  unsavedConfirm: 'You have unsaved changes. Leave without saving?',
  overflowWarning: 'Text overflowed available width. Font size was reduced to fit.',
  statusIdle: 'idle',
  statusHover: 'hover',
  statusSelected: 'selected',
  statusEditing: 'editing',
  statusSaving: 'saving',
  statusSaved: 'saved',
  statusError: 'error',
  dirty: 'dirty',
  saveReverted: 'Saved changes reverted.',
  protectPasswordRequired: 'Password is required unless restrictions-only mode is enabled.',
  protectUnavailable: 'Protect PDF requires qpdf (Node/Desktop runtime). Current browser runtime is not supported.',
};

const RU_MESSAGES: StudioEditMessages = {
  ...EN_MESSAGES,
  whiteoutCustomColor: 'Свой цвет',
  textFontFamily: 'Шрифт',
  textFontSize: 'Размер',
  textColor: 'Цвет текста',
  textBackgroundColor: 'Фон',
};

const SIMPLE_FALLBACKS: Record<Exclude<StudioEditLocale, 'en' | 'ru'>, StudioEditMessages> = {
  de: EN_MESSAGES,
  es: EN_MESSAGES,
  fr: EN_MESSAGES,
  it: EN_MESSAGES,
  pt: EN_MESSAGES,
  ja: EN_MESSAGES,
  zh: EN_MESSAGES,
};

const TRANSLATIONS: Record<StudioEditLocale, StudioEditMessages> = {
  en: EN_MESSAGES,
  ru: RU_MESSAGES,
  ...SIMPLE_FALLBACKS,
};

export function detectStudioEditLocale(): StudioEditLocale {
  if (typeof navigator === 'undefined') {
    return 'en';
  }
  const raw = (navigator.language || 'en').trim().toLowerCase();
  if (raw.startsWith('ru')) {
    return 'ru';
  }
  if (raw.startsWith('de')) {
    return 'de';
  }
  if (raw.startsWith('es')) {
    return 'es';
  }
  if (raw.startsWith('fr')) {
    return 'fr';
  }
  if (raw.startsWith('it')) {
    return 'it';
  }
  if (raw.startsWith('pt')) {
    return 'pt';
  }
  if (raw.startsWith('ja')) {
    return 'ja';
  }
  if (raw.startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export function getStudioEditMessages(locale: StudioEditLocale): StudioEditMessages {
  return TRANSLATIONS[locale] ?? EN_MESSAGES;
}
